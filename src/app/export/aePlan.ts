/**
 * After Effects export plan: what to build in AE, as plain JSON the .jsx reads.
 *
 * - One AE comp per comp network, and one precomp per Subnet instance (each instance has its own
 *   promoted values), so the comp structure stays as designed.
 * - One AE layer per drawable: a split text gets one layer per character / word / line.
 * - Every animated channel (position x/y, scale, rotation, opacity, blur, shape size, mask) is
 *   sampled from `evaluateFrame` and baked by v1's baker into the fewest AE bezier keys within
 *   tolerance. No expressions.
 */
import { evaluateFrame, networkSpan, type Drawable, type MeasureText, type SceneDoc } from "@core/scene";
import { bake, type Baked } from "./bake";

export interface AePlan {
  version: 1;
  /** Comps in build order: precomps before the comps that use them. Last = the main comp. */
  comps: AeComp[];
}

export interface AeComp {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  /** 0..1 RGB, or absent for transparent. */
  bg?: [number, number, number];
  /** Bottom first (AE adds each new layer on top). */
  layers: AeLayer[];
}

export interface AeLayer {
  name: string;
  kind: "text" | "shape" | "precomp";
  in: number;
  out: number;
  /** For precomps: where the precomp's time 0 sits. */
  start?: number;
  text?: { str: string; font: string; size: number; fill: [number, number, number]; tracking: number };
  shape?: { type: "rect" | "ellipse"; radius: number; fill?: [number, number, number]; fillOpacity: number; stroke?: [number, number, number]; strokeWidth: number };
  precomp?: string;
  ch: Partial<Record<Channel, Baked>>;
  /** Reveal mask in layer space, keyed per frame where it changes: [t, x0, y0, x1, y1]. */
  mask?: [number, number, number, number, number][];
}

export type Channel = "x" | "y" | "sx" | "sy" | "rot" | "op" | "blur" | "w" | "h";

const hex = (c: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as [number, number, number];
const alpha = (c: string) => (c.length === 9 ? (parseInt(c.slice(7, 9), 16) / 255) * 100 : 100);

/** "Inter" 700 -> "Inter-Bold": AE wants PostScript names. */
const WEIGHT: Record<number, string> = { 100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" };
export const postScriptName = (family: string, weight: number) => `${family.replace(/\s+/g, "")}-${WEIGHT[Math.round(weight / 100) * 100] ?? "Regular"}`;

/** Position, rotation and scale of a matrix whose anchor is the layer origin (no skew). */
function decompose(m: number[]) {
  const [a, b, c, d, e, f] = m as [number, number, number, number, number, number];
  const sx = Math.hypot(a, b);
  return { x: e, y: f, rot: (Math.atan2(b, a) * 180) / Math.PI, sx: sx * 100, sy: sx ? ((a * d - b * c) / sx) * 100 : 0 };
}

const TOL: Record<Channel, number> = { x: 0.25, y: 0.25, sx: 0.15, sy: 0.15, rot: 0.05, op: 0.3, blur: 0.15, w: 0.25, h: 0.25 };

interface Ctx {
  doc: SceneDoc;
  measure: MeasureText;
  comps: AeComp[];
  done: Set<string>;
}

/** Build one comp (network + optional instance) and, first, the precomps it uses. */
function buildComp(ctx: Ctx, networkId: string, id: string, name: string, duration: number, instance?: { network: string; node: string }): AeComp {
  const { doc, measure } = ctx;
  const net = doc.networks.find((n) => n.id === networkId)!;
  const root = doc.networks.find((n) => n.id === doc.root)!.comp!;
  const comp = net.comp ?? root;
  const fps = comp.fps;
  const opts = { measure, flattenSubnets: false, instance, span: duration };
  const memo = new Map<number, Drawable[]>();
  const at = (t: number) => {
    const k = Math.round(t * 1e6) / 1e6;
    let f = memo.get(k);
    if (!f) memo.set(k, (f = evaluateFrame(doc, networkId, k, opts)));
    return f;
  };
  const frames = Math.max(1, Math.round(duration * fps));

  // Which drawables exist on which frames, and the first sighting of each (its static look).
  const first = new Map<string, Drawable>();
  const span = new Map<string, [number, number]>();
  const order: string[] = [];
  for (let i = 0; i < frames; i++)
    for (const d of at(i / fps)) {
      if (!first.has(d.id)) first.set(d.id, d), order.push(d.id);
      const s = span.get(d.id);
      span.set(d.id, s ? [s[0], i] : [i, i]);
    }

  const layers: AeLayer[] = [];
  for (const id of order) {
    const d0 = first.get(id)!;
    if (d0.kind === "scene3d") continue; // 3D scenes come in as a rendered ProRes pass (roadmap 3D-a, step 4)
    const [f0, f1] = span.get(id)!;
    const t0 = f0 / fps, t1 = f1 / fps;
    const get = (t: number) => at(t).find((x) => x.id === id) ?? at(Math.min(t1, Math.max(t0, t))).find((x) => x.id === id) ?? d0;
    const chan = (fn: (d: Drawable) => number, c: Channel) => bake().channel((t) => fn(get(t)), { t0, t1: Math.max(t1, t0 + 1 / fps), fps, tol: TOL[c] });
    const layer: AeLayer = {
      name: `${d0.node}${d0.parts > 1 ? ` ${d0.part + 1}` : ""}${/\.\d+$/.test(id) ? ` line ${+id.split(".").at(-1)! + 1}` : ""}`,
      kind: d0.kind === "text" ? "text" : d0.kind === "subnet" ? "precomp" : "shape",
      // the layer's own timing when it has one (it may fall between frames); else where it shows
      in: net.nodes.find((n) => n.id === d0.node)?.timing?.in ?? t0,
      out: net.nodes.find((n) => n.id === d0.node)?.timing?.out ?? (f1 + 1) / fps,
      ch: {
        x: chan((d) => decompose(d.matrix).x, "x"),
        y: chan((d) => decompose(d.matrix).y, "y"),
        sx: chan((d) => decompose(d.matrix).sx, "sx"),
        sy: chan((d) => decompose(d.matrix).sy, "sy"),
        rot: chan((d) => decompose(d.matrix).rot, "rot"),
        op: chan((d) => d.opacity * 100, "op"),
        blur: chan((d) => d.blur, "blur"),
      },
    };
    if (d0.kind === "text") {
      layer.name = `${layer.name} · ${d0.text}`;
      layer.text = { str: d0.text, font: postScriptName(d0.font.family, d0.font.weight), size: d0.font.size, fill: hex(d0.fill), tracking: d0.font.size ? (d0.tracking / d0.font.size) * 1000 : 0 };
    } else if (d0.kind === "shape") {
      layer.shape = {
        type: d0.shape === "ellipse" ? "ellipse" : "rect",
        radius: d0.radius,
        fill: alpha(d0.fill) > 0 ? hex(d0.fill) : undefined,
        fillOpacity: alpha(d0.fill),
        stroke: d0.strokeWidth > 0 ? hex(d0.stroke) : undefined,
        strokeWidth: d0.strokeWidth,
      };
      layer.ch.w = chan((d) => (d.kind === "shape" ? d.size[0] : 0), "w");
      layer.ch.h = chan((d) => (d.kind === "shape" ? d.size[1] : 0), "h");
    } else if (d0.kind === "subnet") {
      const inst = { network: networkId, node: d0.node };
      const node = net.nodes.find((n) => n.id === d0.node)!;
      const pre = `${id}`.replace(/[^\w-]+/g, "_");
      const instSpan = networkSpan(doc, d0.subnet, inst);
      if (!ctx.done.has(pre)) {
        ctx.done.add(pre);
        ctx.comps.push(buildComp(ctx, d0.subnet, pre, node.name, instSpan, inst));
      }
      layer.precomp = pre;
      layer.start = node.timing?.in ?? 0;
      layer.name = node.name;
    }
    // Reveal: a rectangle mask in layer space, keyed on every frame where it changes.
    if (d0.kind !== "subnet") {
      const mask: AeLayer["mask"] = [];
      let last = "";
      for (let f = f0; f <= f1; f++) {
        const d = get(f / fps);
        const r = d.clips[0] ? maskRect(d.matrix, d.clips[0].matrix, d.clips[0].rect) : undefined;
        const key = r ? r.map((v) => v.toFixed(2)).join(",") : "none";
        if (key !== last) mask.push([f / fps, ...(r ?? [-1e5, -1e5, 1e5, 1e5])] as [number, number, number, number, number]);
        last = key;
      }
      if (mask.length > 1 || (mask[0] && mask[0][1] !== -1e5)) layer.mask = mask;
    }
    layers.push(layer);
  }
  return { id, name, width: comp.width, height: comp.height, fps, duration, bg: net.comp?.background && !net.comp.background.startsWith("brand:") ? hex(net.comp.background) : undefined, layers };
}

/** A clip rect (in its own frame) as an axis-aligned box in the layer's space. */
function maskRect(layer: number[], clip: number[], r: [number, number, number, number]): [number, number, number, number] {
  const [a, b, c, d, e, f] = layer as [number, number, number, number, number, number];
  const det = a * d - b * c || 1;
  const inv = (x: number, y: number) => [(d * (x - e) - c * (y - f)) / det, (-b * (x - e) + a * (y - f)) / det];
  const [ca, cb, cc, cd, ce, cf] = clip as [number, number, number, number, number, number];
  const pts = [
    [r[0], r[1]],
    [r[0] + r[2], r[1]],
    [r[0], r[1] + r[3]],
    [r[0] + r[2], r[1] + r[3]],
  ].map(([x, y]) => inv(ca * x! + cc * y! + ce, cb * x! + cd * y! + cf));
  const xs = pts.map((p) => p[0]!), ys = pts.map((p) => p[1]!);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function buildAePlan(doc: SceneDoc, networkId: string, measure: MeasureText): AePlan {
  const net = doc.networks.find((n) => n.id === networkId)!;
  const ctx: Ctx = { doc, measure, comps: [], done: new Set() };
  const main = buildComp(ctx, networkId, net.id, net.name, net.comp?.duration ?? networkSpan(doc, networkId));
  if (net.comp?.background?.startsWith("brand:")) {
    const c = doc.brand?.colors.find((x) => x.token === net.comp!.background!.slice(6));
    if (c) main.bg = hex(c.value);
  }
  ctx.comps.push(main);
  return { version: 1, comps: ctx.comps };
}
