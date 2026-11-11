/**
 * Scene evaluation: doc + network + time -> flat list of drawables, in paint order (first = bottom).
 *
 * Pure and deterministic. The doc must already have passed `validateDoc`.
 *
 * How a network evaluates:
 * - Start at the network's `output` node and pull inputs upstream; wires into a node are
 *   taken in array order, which is also the paint order for Merge and Group.
 * - Layer nodes (Text, Shape, Image, Group, Subnet) emit parts. Split cuts text parts into
 *   lines, words or characters. Phase animates every part in its input, staggered by index.
 * - A Subnet evaluates its network at local time `t - timing.in` (AE precomp) and becomes one
 *   part holding the result, so a Phase after a Subnet animates the whole precomp.
 * - Promoted controls: a Subnet node param named after a promoted id overrides the target
 *   param inside, evaluated at the parent's time (keys on an instance are in parent time).
 * - `brand:` colour tokens resolve against the doc's brand kit before interpolation.
 * - Disabled layer nodes draw nothing; disabled Split/Phase/Merge pass their input through.
 * - Parts of layers outside their in/out still count for stagger, so indices stay stable.
 *
 * Coordinates: a layer's matrix is AE's position · rotation · scale · -anchor. Text runs draw
 * from their baseline start, shapes from their top-left corner at [0, 0].
 */
import { CATALOG, isNodeType, type NodeSpec } from "./catalog";
import { isStaggerFrom } from "./delays";
import { evaluateParam, type EvalContext } from "./evaluateParam";
import { applyMat, layerMatrix, mul, rotate, scale, scaleOf, translate, type Mat } from "./matrix";
import { applyPhase, phaseDelays, phaseProgress, REST, type PartAnim, type PhaseSpec } from "./phase";
import type { Network, Node, Param, Role, SceneDoc, Value } from "./schema";
import { approxMeasure, layoutLines, PIVOT_RISE, runsBox, splitRun, type FontSpec, type MeasureText, type Run, type TextStyle } from "./text";

/* ---------- output ---------- */

/** A clip rectangle in its own frame: the part's rest transform, so it stays put while the part moves. */
export interface Clip {
  matrix: Mat;
  rect: [number, number, number, number];
}

interface DrawableBase {
  /** Stable across frames: instance path / node # part [. run]. */
  id: string;
  /** Network and node that produced it, and the Subnet node ids from the evaluated network down. */
  network: string;
  node: string;
  instance: string[];
  role?: Role;
  /** Index of this part within its layer after splitting, and how many there are. */
  part: number;
  parts: number;
  /** Local -> output space. */
  matrix: Mat;
  /** 0..1 */
  opacity: number;
  /** Gaussian blur radius in output px. */
  blur: number;
  /** All must be applied (intersection). */
  clips: Clip[];
}

export interface TextDrawable extends DrawableBase {
  kind: "text";
  /** Draw with fillText(text, 0, 0) at the alphabetic baseline. */
  text: string;
  font: FontSpec;
  /** px after every character (canvas letterSpacing). */
  tracking: number;
  fill: string;
}

export interface ShapeDrawable extends DrawableBase {
  kind: "shape";
  shape: "rect" | "ellipse" | "line" | "path";
  /** Drawn from [0, 0] to size. */
  size: [number, number];
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  path: string;
  trimEnd: number;
}

export interface ImageDrawable extends DrawableBase {
  kind: "image";
  asset: string;
  /** Resolved from doc.assets when the asset id is known. */
  src?: string;
}

export type Drawable = TextDrawable | ShapeDrawable | ImageDrawable;

export interface EvaluateOptions {
  /** Text measuring; defaults to `approxMeasure`. The app passes canvas measureText. */
  measure?: MeasureText;
  /** Length of the evaluated network in seconds, if it isn't a comp. Used as the default out point. */
  span?: number;
}

/* ---------- internal parts ---------- */

interface Layer {
  node: Node;
  network: string;
  instance: string[];
  inPt: number;
  outPt: number;
  visible: boolean;
  param(name: string, ctx?: EvalContext): Value;
}

type Content =
  | { kind: "text"; runs: Run[]; style: TextStyle }
  | { kind: "shape" }
  | { kind: "image" }
  | { kind: "container"; children: Drawable[] };

interface Part {
  layer: Layer;
  index: number;
  count: number;
  content: Content;
  /** Pivot in layer space for Phase scale/rotation; undefined = the layer anchor. */
  pivot?: [number, number];
  anim: PartAnim;
}

interface Ctx {
  doc: SceneDoc;
  brand: Map<string, string>;
  measure: MeasureText;
  net: Network;
  t: number;
  span: number;
  instance: string[];
  overrides: Map<string, Record<string, Param>>;
  memo: Map<string, Part[]>;
}

/* ---------- value helpers ---------- */

const MISSING_COLOR = "#FF00FF";

const num = (v: Value, d = 0) => (typeof v === "number" ? v : d);
const vec2 = (v: Value, d: [number, number] = [0, 0]): [number, number] =>
  Array.isArray(v) && v.length >= 2 ? [v[0]!, v[1]!] : d;
const str = (v: Value, d = "") => (typeof v === "string" ? v : d);
const oneOf = <T extends string>(v: Value, options: readonly T[], d: T): T =>
  typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : d;

function resolveBrand(p: Param, brand: Map<string, string>): Param {
  const map = (v: Value): Value =>
    typeof v === "string" && v.startsWith("brand:") ? brand.get(v.slice(6)) ?? MISSING_COLOR : v;
  const hasToken = (v: Value) => typeof v === "string" && v.startsWith("brand:");
  if (!hasToken(p.value) && !(p.keys ?? []).some((k) => hasToken(k.v))) return p;
  return { ...p, value: map(p.value), keys: p.keys?.map((k) => ({ ...k, v: map(k.v) })) };
}

function specOf(node: Node): NodeSpec | undefined {
  return isNodeType(node.type) ? CATALOG[node.type] : undefined;
}

function getParam(ctx: Ctx, node: Node, name: string): Param | undefined {
  const p = ctx.overrides.get(node.id)?.[name] ?? node.params[name];
  if (p) return resolveBrand(p, ctx.brand);
  const def = specOf(node)?.params[name]?.default;
  return def === undefined ? undefined : { value: def };
}

function paramValue(ctx: Ctx, node: Node, name: string, ectx?: EvalContext): Value {
  const p = getParam(ctx, node, name);
  return p ? evaluateParam(p, ctx.t, ectx) : 0;
}

/* ---------- network evaluation ---------- */

function makeLayer(ctx: Ctx, node: Node): Layer {
  const inPt = node.timing?.in ?? 0;
  const outPt = node.timing?.out ?? ctx.span;
  return {
    node,
    network: ctx.net.id,
    instance: ctx.instance,
    inPt,
    outPt,
    visible: ctx.t >= inPt && ctx.t < outPt,
    param: (name, ectx) => paramValue(ctx, node, name, ectx),
  };
}

const part = (layer: Layer, content: Content): Part => ({ layer, index: 0, count: 1, content, anim: REST });

function phaseSpec(ctx: Ctx, node: Node): PhaseSpec {
  const v = (name: string) => paramValue(ctx, node, name);
  const offset = vec2(v("offsetPosition"));
  const from = v("from");
  return {
    mode: oneOf(v("mode"), ["in", "out"] as const, "in"),
    startMs: num(v("start")) * 1000,
    durationMs: num(v("duration"), 0.6) * 1000,
    ease: str(v("ease"), "outExpo"),
    staggerMs: num(v("stagger")) * 1000,
    from: isStaggerFrom(from) ? from : "first",
    x: offset[0],
    y: offset[1],
    scale: num(v("offsetScale"), 100),
    rotation: num(v("offsetRotation")),
    opacity: num(v("offsetOpacity")),
    blur: num(v("offsetBlur")),
    reveal: oneOf(v("reveal"), ["none", "up", "down", "left", "right"] as const, "none"),
  };
}

/** Number parts of each layer 0..n-1 in stream order. */
function reindex(parts: Part[]): Part[] {
  const counts = new Map<Layer, number>();
  for (const p of parts) counts.set(p.layer, (counts.get(p.layer) ?? 0) + 1);
  const seen = new Map<Layer, number>();
  return parts.map((p) => {
    const i = seen.get(p.layer) ?? 0;
    seen.set(p.layer, i + 1);
    return { ...p, index: i, count: counts.get(p.layer)! };
  });
}

function splitPart(ctx: Ctx, p: Part, by: "characters" | "words" | "lines"): Part[] {
  if (p.content.kind !== "text") return [p];
  const { runs, style } = p.content;
  const units = by === "lines" ? runs.map((r) => [r]) : runs.flatMap((r) => splitRun(r, by, style, ctx.measure).map((u) => [u]));
  return units.map((u) => {
    const r = u[0]!;
    return {
      ...p,
      content: { kind: "text", runs: u, style },
      pivot: [r.x + r.width / 2, r.y - style.font.size * PIVOT_RISE],
    };
  });
}

function evalNode(ctx: Ctx, id: string, stack: string[] = []): Part[] {
  const cached = ctx.memo.get(id);
  if (cached) return cached;
  if (stack.includes(id)) throw new Error(`wire cycle in ${ctx.net.id}: ${[...stack, id].join(" > ")}`);
  const node = ctx.net.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`node ${ctx.net.id}/${id} not found`);

  const inputs = (): Part[] =>
    ctx.net.wires.filter((w) => w.to.node === id).flatMap((w) => evalNode(ctx, w.from.node, [...stack, id]));
  const isLayer = specOf(node)?.category === "layer";
  let out: Part[];

  if (!node.enabled) out = isLayer ? [] : inputs();
  else
    switch (node.type) {
      case "Text": {
        const layer = makeLayer(ctx, node);
        const v = (name: string) => layer.param(name);
        const style: TextStyle = {
          font: { family: str(v("font"), "Inter"), weight: num(v("weight"), 600), size: num(v("size"), 64) },
          tracking: num(v("tracking")),
          leading: num(v("leading"), 1.2),
          align: oneOf(v("align"), ["left", "center", "right"] as const, "left"),
        };
        out = [part(layer, { kind: "text", runs: layoutLines(String(v("text")), style, ctx.measure), style })];
        break;
      }
      case "Shape":
        out = [part(makeLayer(ctx, node), { kind: "shape" })];
        break;
      case "Image":
        out = [part(makeLayer(ctx, node), { kind: "image" })];
        break;
      case "Group": {
        const layer = makeLayer(ctx, node);
        out = [part(layer, { kind: "container", children: layer.visible ? resolveParts(ctx, inputs()) : [] })];
        break;
      }
      case "Subnet": {
        const layer = makeLayer(ctx, node);
        out = [part(layer, { kind: "container", children: layer.visible ? evalSubnet(ctx, node) : [] })];
        break;
      }
      case "Split": {
        const by = oneOf(paramValue(ctx, node, "by"), ["characters", "words", "lines"] as const, "words");
        out = reindex(inputs().flatMap((p) => splitPart(ctx, p, by)));
        break;
      }
      case "Phase": {
        const parts = inputs();
        const spec = phaseSpec(ctx, node);
        const delays = phaseDelays(spec, parts.length);
        const tMs = ctx.t * 1000;
        out = parts.map((p, i) => {
          const progress = phaseProgress(spec, delays, i, tMs, p.layer.inPt * 1000, p.layer.outPt * 1000);
          return { ...p, anim: applyPhase(p.anim, spec, progress) };
        });
        break;
      }
      default: // Merge, Output, State (phase 1+): pass through in wire order
        out = inputs();
    }

  ctx.memo.set(id, out);
  return out;
}

function evalSubnet(ctx: Ctx, node: Node): Drawable[] {
  const net = ctx.doc.networks.find((n) => n.id === node.subnet);
  if (!net) return [];
  const overrides = new Map<string, Record<string, Param>>();
  for (const pr of net.promoted ?? []) {
    const raw = ctx.overrides.get(node.id)?.[pr.id] ?? node.params[pr.id];
    if (!raw) continue; // not set on this instance: the inner value stands
    const rec = overrides.get(pr.target.node) ?? {};
    rec[pr.target.param] = { value: evaluateParam(resolveBrand(raw, ctx.brand), ctx.t) };
    overrides.set(pr.target.node, rec);
  }
  const span = node.timing ? node.timing.out - node.timing.in : net.comp?.duration ?? ctx.span;
  return evalNetwork(ctx.doc, net, ctx.t - (node.timing?.in ?? 0), {
    brand: ctx.brand,
    measure: ctx.measure,
    span,
    instance: [...ctx.instance, node.id],
    overrides,
  });
}

function evalNetwork(
  doc: SceneDoc,
  net: Network,
  t: number,
  o: Pick<Ctx, "brand" | "measure" | "span" | "instance" | "overrides">,
): Drawable[] {
  const ctx: Ctx = { doc, net, t, memo: new Map(), ...o };
  return resolveParts(ctx, evalNode(ctx, net.output));
}

/* ---------- parts -> drawables ---------- */

function revealRect(box: [number, number, number, number], r: NonNullable<PartAnim["reveal"]>): [number, number, number, number] {
  const [x, y, w, h] = box;
  const span = Math.max(0, r.to - r.from);
  return r.axis === "y" ? [x, y + h * r.from, w, h * span] : [x + w * r.from, y, w * span, h];
}

function resolveParts(ctx: Ctx, parts: Part[]): Drawable[] {
  return parts.filter((p) => p.layer.visible).flatMap((p) => resolvePart(ctx, p));
}

function resolvePart(ctx: Ctx, p: Part): Drawable[] {
  const { layer, anim, content } = p;
  const ectx: EvalContext = { part: p.index, parts: p.count };
  const v = (name: string) => layer.param(name, ectx);

  const position = vec2(v("position"));
  const anchor = vec2(v("anchor"));
  const L = layerMatrix(position, anchor, vec2(v("scale"), [100, 100]), num(v("rotation")));
  const pw = applyMat(L, p.pivot ?? anchor);
  const A = mul(mul(mul(translate(anim.dx + pw[0], anim.dy + pw[1]), rotate(anim.rot)), scale(anim.sx, anim.sy)), translate(-pw[0], -pw[1]));
  const M = mul(A, L);
  const opacity = Math.min(1, Math.max(0, num(v("opacity"), 100) / 100)) * anim.op;
  const blur = Math.max(0, num(v("blur"))) + anim.blur;

  const box: [number, number, number, number] | undefined =
    content.kind === "text"
      ? runsBox(content.runs, content.style.font.size)
      : content.kind === "shape"
        ? [0, 0, ...vec2(v("size"), [400, 120])]
        : undefined; // images and containers have no known box in core; reveal skips them
  // A finished reveal clips nothing; dropping it keeps glyphs that overshoot the approximate box intact.
  const revealing = anim.reveal && (anim.reveal.from > 0 || anim.reveal.to < 1);
  const clips: Clip[] = revealing && box ? [{ matrix: L, rect: revealRect(box, anim.reveal!) }] : [];

  const base = {
    network: layer.network,
    node: layer.node.id,
    instance: layer.instance,
    role: layer.node.role,
    part: p.index,
    parts: p.count,
    opacity,
    blur,
    clips,
  };
  const idOf = (suffix = "") => `${[...layer.instance, layer.node.id].join("/")}#${p.index}${suffix}`;

  switch (content.kind) {
    case "text": {
      const fill = str(v("fill"), "#FFFFFF");
      return content.runs.map((r, i) => ({
        ...base,
        kind: "text" as const,
        id: idOf(content.runs.length > 1 ? `.${i}` : ""),
        matrix: mul(M, translate(r.x, r.y)),
        text: r.text,
        font: content.style.font,
        tracking: content.style.tracking,
        fill,
      }));
    }
    case "shape":
      return [
        {
          ...base,
          kind: "shape",
          id: idOf(),
          matrix: M,
          shape: oneOf(v("shape"), ["rect", "ellipse", "line", "path"] as const, "rect"),
          size: vec2(v("size"), [400, 120]),
          radius: num(v("radius")),
          fill: str(v("fill"), "#000000"),
          stroke: str(v("stroke"), "#00000000"),
          strokeWidth: num(v("strokeWidth")),
          path: str(v("path")),
          trimEnd: num(v("trimEnd"), 100),
        },
      ];
    case "image": {
      const asset = str(v("asset"));
      const src = ctx.doc.assets.find((a) => a.id === asset)?.src;
      return [{ ...base, kind: "image", id: idOf(), matrix: M, asset, ...(src === undefined ? {} : { src }) }];
    }
    case "container": {
      const k = scaleOf(M);
      return content.children.map((d) => ({
        ...d,
        matrix: mul(M, d.matrix),
        opacity: d.opacity * opacity,
        blur: Math.hypot(d.blur * k, blur),
        clips: [...d.clips.map((c) => ({ ...c, matrix: mul(M, c.matrix) })), ...clips],
      }));
    }
  }
}

/* ---------- entry point ---------- */

/**
 * Length of a network in seconds: its comp duration, else the span of the given Subnet instance
 * (or the first instance with timing), else the root comp's duration.
 */
export function networkSpan(doc: SceneDoc, networkId: string, instance?: { network: string; node: string }): number {
  const net = doc.networks.find((n) => n.id === networkId);
  if (net?.comp) return net.comp.duration;
  const root = doc.networks.find((n) => n.id === doc.root)?.comp?.duration ?? 0;
  if (instance) {
    const node = doc.networks.find((n) => n.id === instance.network)?.nodes.find((n) => n.id === instance.node);
    if (node?.timing) return node.timing.out - node.timing.in;
    return networkSpan(doc, instance.network);
  }
  for (const n of doc.networks)
    for (const node of n.nodes) if (node.subnet === networkId && node.timing) return node.timing.out - node.timing.in;
  return root;
}

/**
 * Everything visible in `networkId` at time `t` (seconds), flattened to drawables in paint order.
 * Matrices map into the network's own space (comp pixels for a comp).
 */
function rootCtx(doc: SceneDoc, networkId: string, t: number, opts: EvaluateOptions): Ctx {
  const net = doc.networks.find((n) => n.id === networkId);
  if (!net) throw new Error(`network "${networkId}" not found`);
  return {
    doc,
    net,
    t,
    memo: new Map(),
    brand: new Map((doc.brand?.colors ?? []).map((c) => [c.token, c.value])),
    measure: opts.measure ?? approxMeasure,
    span: opts.span ?? networkSpan(doc, networkId),
    instance: [],
    overrides: new Map(),
  };
}

export function evaluateFrame(doc: SceneDoc, networkId: string, t: number, opts: EvaluateOptions = {}): Drawable[] {
  const ctx = rootCtx(doc, networkId, t, opts);
  return resolveParts(ctx, evalNode(ctx, ctx.net.output));
}

export interface PhaseRange {
  /** Layer node the part belongs to, and its index within that layer. */
  node: string;
  part: number;
  /** Seconds in the network's time: when this part's phase starts and ends. */
  start: number;
  end: number;
}

/**
 * When each part animates under a Phase node (v1's `timing`), for drawing phase bars on the
 * timeline. Parts are counted at time `t` (text can change, and with it the number of parts).
 */
export function phaseRanges(doc: SceneDoc, networkId: string, phaseId: string, t = 0, opts: EvaluateOptions = {}): PhaseRange[] {
  const ctx = rootCtx(doc, networkId, t, opts);
  const node = ctx.net.nodes.find((n) => n.id === phaseId);
  if (!node || node.type !== "Phase") return [];
  const parts = ctx.net.wires.filter((w) => w.to.node === phaseId).flatMap((w) => evalNode(ctx, w.from.node));
  const spec = phaseSpec(ctx, node);
  const delays = phaseDelays(spec, parts.length);
  const maxD = Math.max(0, ...delays);
  return parts.map((p, i) => {
    const d = delays[i] ?? 0;
    const startMs =
      spec.mode === "in"
        ? p.layer.inPt * 1000 + spec.startMs + d
        : p.layer.outPt * 1000 - spec.startMs - (maxD - d) - spec.durationMs;
    return { node: p.layer.node.id, part: p.index, start: startMs / 1000, end: (startMs + spec.durationMs) / 1000 };
  });
}
