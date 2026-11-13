/**
 * Import and Draft: turn imported layers into a scene doc, tag their roles, and lay one of three
 * first animations (smooth, punchy, playful) over them. Pure and deterministic: the same layers
 * and character always give the same doc. Drafts are plain Phase / Split nodes, editable like any.
 */
import { easeChoice, easeString, SPRING_FEELS } from "../motion/presets";
import type { Node, Role, SceneDoc } from "./schema";
import { CATALOG, isNodeType, type ParamSpec } from "./catalog";
import type { Value } from "./schema";

export type ImportLayer =
  | { kind: "text"; name: string; text: string; size: number; weight: number; fill: string; font?: string; align?: "left" | "center" | "right"; position: [number, number]; role?: Role }
  | { kind: "rect" | "ellipse"; name: string; size: [number, number]; fill: string; radius?: number; position: [number, number]; role?: Role }
  | { kind: "image"; name: string; src: string; scale: number; size: [number, number]; position: [number, number]; role?: Role; hidden?: boolean };

export interface ImportDesign {
  name: string;
  width: number;
  height: number;
  /** Seconds; default 5. */
  duration?: number;
  layers: ImportLayer[];
  source: "svg" | "image" | "prompt" | "blank";
}

/** Generic roles from size and position: the biggest text is the title, a frame-filling shape the background. */
export function guessRoles(d: ImportDesign): ImportLayer[] {
  const texts = d.layers.filter((l) => l.kind === "text").sort((a, b) => (b as { size: number }).size - (a as { size: number }).size);
  return d.layers.map((l) => {
    if (l.role) return l;
    if (l.kind === "text") {
      const i = texts.indexOf(l);
      return { ...l, role: i === 0 ? "title" : i === 1 ? "subtitle" : "body" };
    }
    const area = (l.size[0] * l.size[1]) / (d.width * d.height);
    if (l.kind === "image") return { ...l, role: area < 0.06 ? "logo" : area > 0.8 ? "background" : "image" };
    return { ...l, role: area > 0.8 ? "background" : area < 0.01 ? "accent" : "panel" };
  });
}

const slug = (i: number) => `l${i + 1}`;

/** A comp holding the layers bottom to top (first layer at the back), merged to the output. */
export function buildDesignDoc(d: ImportDesign): SceneDoc {
  const layers = guessRoles(d);
  const nodes: Node[] = [];
  const assets: SceneDoc["assets"] = [];
  layers.forEach((l, i) => {
    const base = { id: slug(i), name: l.name || `Layer ${i + 1}`, role: l.role, enabled: !(l.kind === "image" && l.hidden), ui: { x: 0, y: i * 120 } };
    if (l.kind === "text")
      nodes.push({ ...base, type: "Text", params: { text: { value: l.text }, font: { value: l.font ?? "Inter" }, weight: { value: l.weight }, size: { value: l.size }, fill: { value: l.fill }, ...(l.align && l.align !== "left" ? { align: { value: l.align } } : {}), position: { value: l.position } } });
    else if (l.kind === "image") {
      assets.push({ id: `img-${i + 1}`, kind: "image", src: l.src, meta: { width: l.size[0], height: l.size[1] } });
      nodes.push({ ...base, type: "Image", params: { asset: { value: `img-${i + 1}` }, position: { value: l.position }, scale: { value: [l.scale * 100, l.scale * 100] } } });
    } else
      nodes.push({ ...base, type: "Shape", params: { shape: { value: l.kind }, size: { value: l.size }, fill: { value: l.fill }, radius: { value: l.radius ?? 0 }, position: { value: l.position } } });
  });
  nodes.push({ id: "merge", type: "Merge", name: "Merge", enabled: true, params: {}, ui: { x: 440, y: 0 } });
  nodes.push({ id: "out", type: "Output", name: "Output", enabled: true, params: {}, ui: { x: 660, y: 0 } });
  return {
    version: 3,
    name: d.name,
    root: "main",
    source: { kind: d.source, ref: d.name },
    assets,
    batches: [],
    networks: [
      {
        id: "main",
        name: "Main_v01",
        comp: { width: d.width, height: d.height, fps: 25, duration: d.duration ?? 5 },
        output: "out",
        wires: [...layers.map((_, i) => ({ from: { node: slug(i), port: "out" }, to: { node: "merge", port: "in" } })), { from: { node: "merge", port: "out" }, to: { node: "out", port: "in" } }],
        nodes,
      },
    ],
  };
}

/* ---------- drafts ---------- */

export type DraftCharacter = "smooth" | "punchy" | "playful";

/** How one layer comes in. Every field is a plain Phase / Split setting. */
export interface RoleMotion {
  /** Optional absolute entrance delay after the layer's in point. */
  start?: number;
  /** Already composed / continuous motion: don't add an entrance. */
  enabled?: boolean;
  ease: string;
  duration: number;
  stagger: number;
  offset: [number, number];
  scale: number;
  rotation: number;
  opacity: number;
  blur: number;
  reveal: "none" | "up" | "down" | "left" | "right";
  split: "none" | "characters" | "words" | "lines";
  from: "first" | "last" | "center" | "random" | "edges";
}

/** A whole first animation: a default motion, per-role overrides and the gap between layers. */
export interface DraftSpec {
  name: string;
  desc: string;
  gap: number;
  motion: RoleMotion;
  byRole?: Partial<Record<Role, Partial<RoleMotion>>>;
  byLayer?: { node: string; motion?: Partial<RoleMotion>; out?: Partial<RoleMotion>; tracks?: { param: string; keys: { t: number; v: Value; ease: string }[] }[] }[];
}

const bouncy = SPRING_FEELS.find((f) => f.name === "Bouncy")!;

/** The three takes. Same rules as CHARACTERS (presets.ts): they stay distinct on any design. */
export const DRAFTS: Record<DraftCharacter, { name: string; desc: string; ease: string; duration: number; stagger: number; gap: number; offset: [number, number]; scale: number; split: boolean }> = {
  smooth: { name: "Smooth", desc: "Calm rise and fade, one layer after the other.", ease: "outQuart", duration: 0.9, stagger: 0.06, gap: 0.15, offset: [0, 30], scale: 100, split: false },
  punchy: { name: "Punchy", desc: "Fast wipes, the headline word by word.", ease: "outExpo", duration: 0.35, stagger: 0.04, gap: 0.08, offset: [0, 0], scale: 100, split: true },
  playful: { name: "Playful", desc: "Springs in with a bounce and a little scale.", ease: easeString({ ease: "spring", amount: bouncy.amount, duration: bouncy.duration }), duration: 0.7, stagger: 0.05, gap: 0.12, offset: [0, 60], scale: 60, split: true },
};

const BASE: RoleMotion = { ease: "outQuart", duration: 0.8, stagger: 0.05, offset: [0, 30], scale: 100, rotation: 0, opacity: 0, blur: 0, reveal: "none", split: "none", from: "first" };

/** One of the three characters as a spec (background fades, punchy wipes, the title splits). */
export function draftSpec(character: DraftCharacter): DraftSpec {
  const c = DRAFTS[character];
  const motion: RoleMotion = { ...BASE, ease: c.ease, duration: c.duration, stagger: c.stagger, offset: c.offset, scale: c.scale, reveal: character === "punchy" ? "right" : "none" };
  const back: Partial<RoleMotion> = { ease: "outQuart", duration: Math.max(c.duration, 0.5), offset: [0, 0], scale: 100, reveal: "none" };
  const text: Partial<RoleMotion> = character === "punchy" ? { reveal: "up" } : {};
  return {
    name: c.name,
    desc: c.desc,
    gap: c.gap,
    motion,
    byRole: { background: back, title: { ...text, split: c.split ? "words" : "none" }, subtitle: text, body: text, label: text },
  };
}

/** Back to front order a draft animates in: background, panels, then the type. */
const ORDER: Partial<Record<Role, number>> = { background: 0, image: 1, panel: 2, decoration: 2, accent: 3, logo: 4, title: 5, subtitle: 6, body: 7, label: 7 };
const LAYER_TYPES = new Set(["Text", "Shape", "Image", "Group", "Subnet", "Scene3D"]);

/** Draft with one of the three characters. */
export const applyDraft = (doc: SceneDoc, character: DraftCharacter): SceneDoc => applyDraftSpec(doc, draftSpec(character));

/**
 * The doc with one draft on the root comp: any existing Animate in / out and Split nodes there are
 * removed (wires bridged), then each layer gets its own in-animation, timed back to front.
 */
export function applyDraftSpec(doc: SceneDoc, spec: DraftSpec): SceneDoc {
  const d: SceneDoc = structuredClone(doc);
  const net = d.networks.find((n) => n.id === d.root)!;
  for (const n of [...net.nodes].filter((n) => n.type === "Phase" || n.type === "Split")) {
    const ins = net.wires.filter((w) => w.to.node === n.id && w.to.port === "in").map((w) => w.from);
    const outs = net.wires.filter((w) => w.from.node === n.id).map((w) => w.to);
    net.wires = net.wires.filter((w) => w.to.node !== n.id && w.from.node !== n.id);
    for (const a of ins) for (const b of outs) net.wires.push({ from: a, to: b });
    net.nodes = net.nodes.filter((x) => x.id !== n.id);
  }
  const layers = net.nodes
    .filter((n) => LAYER_TYPES.has(n.type) && net.wires.some((w) => w.from.node === n.id))
    .map((n, i) => ({ n, i }))
    .sort((a, b) => (ORDER[a.n.role ?? "none"] ?? 5) - (ORDER[b.n.role ?? "none"] ?? 5) || a.i - b.i)
    .map((x) => x.n);
  layers.forEach((layer, k) => {
    const override = spec.byLayer?.find((x) => x.node === layer.id);
    const m: RoleMotion = { ...spec.motion, ...(layer.role ? spec.byRole?.[layer.role] : undefined), ...override?.motion };
    const chain: Node[] = [];
    const duration = net.comp?.duration ?? 5;
    const fps = net.comp?.fps ?? 25;
    const snap = (t: number) => Math.round(Math.max(0, Math.min(duration, t)) * fps) / fps;
    if (m.split !== "none" && layer.type === "Text")
      chain.push({ id: `${layer.id}-split`, type: "Split", name: `${layer.name} ${m.split}`, enabled: true, params: { by: { value: m.split } }, ui: { x: layer.ui.x + 200, y: layer.ui.y } });
    if (m.enabled !== false) chain.push({
      id: `${layer.id}-in`,
      type: "Phase",
      name: `${layer.name} in`,
      enabled: true,
      params: {
        mode: { value: "in" },
        start: { value: snap(m.start ?? k * spec.gap) },
        duration: { value: m.duration },
        ease: { value: m.ease },
        stagger: { value: m.stagger },
        from: { value: m.from },
        offsetPosition: { value: m.offset },
        offsetScale: { value: m.scale },
        offsetRotation: { value: m.rotation },
        offsetOpacity: { value: m.opacity },
        offsetBlur: { value: m.blur },
        reveal: { value: m.reveal },
      },
      ui: { x: layer.ui.x + 400, y: layer.ui.y },
    });
    if (override?.out && override.out.enabled !== false) {
      const out = { ...m, ...override.out };
      chain.push({ id: `${layer.id}-out`, type: "Phase", name: `${layer.name} out`, enabled: true,
        params: { mode: { value: "out" }, start: { value: snap(override.out.start ?? 0) }, duration: { value: out.duration }, ease: { value: out.ease }, stagger: { value: out.stagger }, from: { value: out.from }, offsetPosition: { value: out.offset }, offsetScale: { value: out.scale }, offsetRotation: { value: out.rotation }, offsetOpacity: { value: out.opacity }, offsetBlur: { value: out.blur }, reveal: { value: out.reveal } },
        ui: { x: layer.ui.x + 600, y: layer.ui.y } });
    }
    // Full choreography stays ordinary checked keys, leaving the design's base state untouched.
    for (const track of override?.tracks ?? []) {
      const ps = isNodeType(layer.type) ? (CATALOG[layer.type].params as Record<string, ParamSpec>)[track.param] : undefined;
      if (!ps?.animatable) continue;
      const keys = new Map<number, { t: number; v: Value; ease: string }>();
      for (const key of track.keys) {
        const value = key.v;
        const valid = ps.kind === "number" ? typeof value === "number" && Number.isFinite(value)
          : ps.kind === "vec2" || ps.kind === "vec3" ? Array.isArray(value) && value.length === (ps.kind === "vec2" ? 2 : 3) && value.every(Number.isFinite)
          : ps.kind === "color" ? typeof value === "string" && /^(#[0-9a-f]{6}|brand:[\w-]+)$/i.test(value)
          : false;
        if (!valid || !Number.isFinite(key.t)) continue;
        const clampValue = (v: number) => Math.min(ps.max ?? Infinity, Math.max(ps.min ?? -Infinity, v));
        const v = typeof value === "number" ? clampValue(value) : Array.isArray(value) ? value.map(clampValue) as Value : value;
        const t = snap(key.t);
        keys.set(t, { t, v, ease: knownEase(key.ease) ? key.ease : "linear" });
      }
      if (keys.size < 2) continue;
      layer.params[track.param] = { ...(layer.params[track.param] ?? { value: ps.default }), keys: [...keys.values()].sort((a, b) => a.t - b.t) };
    }
    const outs = net.wires.filter((w) => w.from.node === layer.id);
    net.wires = net.wires.filter((w) => w.from.node !== layer.id);
    let prev = layer.id;
    for (const n of chain) {
      net.nodes.push(n);
      net.wires.push({ from: { node: prev, port: "out" }, to: { node: n.id, port: "in" } });
      prev = n.id;
    }
    for (const w of outs) net.wires.push({ from: { node: prev, port: "out" }, to: w.to });
  });
  return d;
}

/* ---------- checking AI answers ---------- */

const ROLES = new Set<string>(["background", "panel", "title", "subtitle", "body", "label", "accent", "logo", "icon", "image", "decoration"]);
const clamp = (v: unknown, a: number, b: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
const pick = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : d);

/** Eases the engine runs: the v1 menu (with amounts), beziers, springs, steps and hold. */
export const knownEase = (e: unknown): e is string =>
  typeof e === "string" && (e === "hold" || /^steps\(\d+\)$/.test(e.replace(/\s+/g, "")) || !!easeChoice(e.replace(/\s+/g, "")));

function checkMotion(raw: unknown, base: RoleMotion | undefined): Partial<RoleMotion> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: Partial<RoleMotion> = {};
  const b = base ?? BASE;
  if (typeof r.enabled === "boolean") out.enabled = r.enabled;
  if ("start" in r) out.start = clamp(r.start, 0, 600, 0);
  if ("ease" in r || base) out.ease = knownEase(r.ease) ? String(r.ease).replace(/\s+/g, "") : b.ease;
  if ("duration" in r || base) out.duration = clamp(r.duration, 0.05, 4, b.duration);
  if ("stagger" in r || base) out.stagger = clamp(r.stagger, 0, 0.5, b.stagger);
  if ("offset" in r || base) out.offset = Array.isArray(r.offset) && r.offset.length === 2 ? [clamp(r.offset[0], -2000, 2000, 0), clamp(r.offset[1], -2000, 2000, 0)] : b.offset;
  if ("scale" in r || base) out.scale = clamp(r.scale, 0, 400, b.scale);
  if ("rotation" in r || base) out.rotation = clamp(r.rotation, -720, 720, b.rotation);
  if ("opacity" in r || base) out.opacity = clamp(r.opacity, 0, 100, b.opacity);
  if ("blur" in r || base) out.blur = clamp(r.blur, 0, 200, b.blur);
  if ("reveal" in r || base) out.reveal = pick(r.reveal, ["none", "up", "down", "left", "right"] as const, b.reveal);
  if ("split" in r || base) out.split = pick(r.split, ["none", "characters", "words", "lines"] as const, b.split);
  if ("from" in r || base) out.from = pick(r.from, ["first", "last", "center", "random", "edges"] as const, b.from);
  return out;
}

/** An AI draft answer made safe: known eases only, values clamped, unknown roles dropped. */
export function checkDraftSpec(raw: unknown): DraftSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  const byRole: DraftSpec["byRole"] = {};
  if (Array.isArray(r.byRole))
    for (const x of r.byRole as Record<string, unknown>[]) if (ROLES.has(String(x?.role))) byRole[x.role as Role] = checkMotion(x, undefined);
  return {
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 40) : "Your prompt",
    desc: typeof r.desc === "string" ? r.desc.slice(0, 200) : "",
    gap: clamp(r.gap, 0, 2, 0.12),
    motion: checkMotion(r.motion, BASE) as RoleMotion,
    byRole,
    ...(Array.isArray(r.byLayer) ? { byLayer: r.byLayer.slice(0, 60).flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const x = item as Record<string, unknown>;
      if (typeof x.node !== "string") return [];
      const tracks = Array.isArray(x.tracks) ? x.tracks.slice(0, 20).flatMap((item: unknown) => {
        if (!item || typeof item !== "object") return [];
        const track = item as Record<string, unknown>;
        if (typeof track.param !== "string" || !Array.isArray(track.keys)) return [];
        return [{ param: track.param, keys: track.keys.slice(0, 100).flatMap((item: unknown) => {
          if (!item || typeof item !== "object") return [];
          const key = item as Record<string, unknown>;
          if (typeof key.t !== "number" || !Number.isFinite(key.t)) return [];
          const v = key.v;
          if (!(typeof v === "number" && Number.isFinite(v) || typeof v === "string" || Array.isArray(v) && v.length >= 2 && v.length <= 3 && v.every((n) => typeof n === "number" && Number.isFinite(n)))) return [];
          return [{ t: Math.max(0, key.t), v: v as Value, ease: knownEase(key.ease) ? key.ease : "linear" }];
        }) }];
      }) : undefined;
      return [{ node: x.node.slice(0, 64), motion: checkMotion(x.motion, undefined), ...(x.out && typeof x.out === "object" ? { out: checkMotion(x.out, undefined) } : {}), ...(tracks?.length ? { tracks } : {}) }];
    }) } : {}),
  };
}

/** A layer the AI read off a reference picture, in comp px (top-left box), made safe. */
export function checkReferenceLayers(raw: unknown, width: number, height: number): ImportLayer[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportLayer[] = [];
  for (const x of raw.slice(0, 40) as Record<string, unknown>[]) {
    const kind = pick(x?.kind, ["rect", "ellipse", "text"] as const, "rect");
    const role = ROLES.has(String(x?.role)) ? (x.role as Role) : undefined;
    const px = clamp(x?.x, -width, width * 2, 0), py = clamp(x?.y, -height, height * 2, 0);
    const name = typeof x?.name === "string" && x.name ? x.name.slice(0, 40) : kind === "text" ? "Text" : "Shape";
    if (kind === "text") {
      const text = typeof x?.text === "string" ? x.text.trim().slice(0, 200) : "";
      if (!text) continue;
      const size = clamp(x?.size, 6, 600, 48);
      // the model gives the text's top edge; layers sit on their baseline
      out.push({ kind, name, text, size, weight: Math.round(clamp(x?.weight, 100, 900, 400) / 100) * 100, fill: hex(x?.fill, "#FFFFFF"), position: [px, Math.round(py + size * 0.8)], role });
    } else {
      const w = clamp(x?.w, 1, width * 2, 100), h = clamp(x?.h, 1, height * 2, 100);
      out.push({ kind, name, size: [w, h], fill: hex(x?.fill, "#888888"), radius: kind === "rect" ? clamp(x?.radius, 0, Math.min(w, h) / 2, 0) : 0, position: [px, py], role });
    }
  }
  return out;
}
