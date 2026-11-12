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
 * - A Scene3D layer evaluates its network (local time, like a Subnet) into a `Scene3D`: objects,
 *   camera, lights and materials as plain data (see scene3d.ts). It draws as one layer from
 *   [0, 0] to its `size`. Evaluating a 3D network itself returns that one scene drawable.
 * - Named input ports (an object's `material`) are not part of the pull: they feed that node only.
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
import { applyEffector, applyReveal, cloneMatrix, clonePoint, fieldWeight, makeClones, type EffectorSpec, type FieldSpec } from "./clone";
import { objectMatrix, verticalFov, zoomFor, type Camera3D, type Light3D, type Material3D, type Object3D, type Scene3D } from "./scene3d";
import { approxMeasure, fitStyle, layoutLines, PIVOT_RISE, runsBox, splitRun, type FontSpec, type MeasureText, type Run, type TextStyle } from "./text";

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

/**
 * A Subnet instance as one layer, emitted instead of its contents when `flattenSubnets` is false
 * (exporters keep the comp structure: this becomes a precomp layer). Its matrix, opacity and blur
 * are the instance's own; clips are not applied to precomp layers.
 */
export interface SubnetDrawable extends DrawableBase {
  kind: "subnet";
  /** The network the instance opens into. */
  subnet: string;
}

/** A 3D scene drawn as one layer from [0, 0] to `size` (a renderer draws `scene` with three.js). */
export interface Scene3DDrawable extends DrawableBase {
  kind: "scene3d";
  size: [number, number];
  /** The network holding the scene's nodes. */
  subnet: string;
  scene: Scene3D;
}

export type Drawable = TextDrawable | ShapeDrawable | ImageDrawable | SubnetDrawable | Scene3DDrawable;

export interface EvaluateOptions {
  /** Text measuring; defaults to `approxMeasure`. The app passes canvas measureText. */
  measure?: MeasureText;
  /** Length of the evaluated network in seconds, if it isn't a comp. Used as the default out point. */
  span?: number;
  /**
   * False keeps Subnet instances as single `SubnetDrawable`s (for exporters) instead of merging
   * their contents into this network's list. Default true (what renderers want).
   */
  flattenSubnets?: boolean;
  /**
   * Evaluate the network as the inside of this Subnet instance: its promoted values apply, and
   * `t` is the instance's local time.
   */
  instance?: { network: string; node: string };
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
  | { kind: "container"; children: Drawable[] }
  | { kind: "subnet"; subnet: string }
  | { kind: "scene3d"; subnet: string; scene: Scene3D };

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
  /** False: Subnet instances stay single parts (exporters). */
  flatten?: boolean;
  /** How deep we are in link resolution (a link can follow a param that is linked itself). */
  linkDepth?: number;
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
  // only a whole value that is a token (a palette text with tokens inside is resolved where it's read)
  const isToken = (v: Value) => typeof v === "string" && /^brand:[a-z0-9-]+$/.test(v);
  const map = (v: Value): Value => (isToken(v) ? brand.get((v as string).slice(6)) ?? MISSING_COLOR : v);
  const hasToken = isToken;
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
  return p ? evaluateParam(p, ctx.t, { ...ectx, resolve: (m) => resolveLink(ctx, m) }) : 0;
}

const MAX_LINK_DEPTH = 16;

/**
 * The value a `link` modifier follows: another node's param in the same network at the same time,
 * or its read-only `bounds` ([width, height] of what it draws). Links that loop stop after a
 * fixed depth and contribute nothing.
 */
function resolveLink(ctx: Ctx, m: { params: Record<string, Value> }): Value | undefined {
  const target = ctx.net.nodes.find((n) => n.id === m.params.node);
  const param = m.params.param;
  if (!target || typeof param !== "string") return undefined;
  const depth = ctx.linkDepth ?? 0;
  if (depth >= MAX_LINK_DEPTH) return undefined;
  ctx.linkDepth = depth + 1;
  try {
    return param === "bounds" ? boundsOf(ctx, target) : paramValue(ctx, target, param);
  } finally {
    ctx.linkDepth = depth;
  }
}

/** Text style and lines of a Text node at the context's time, after overflow handling. */
function textLayout(ctx: Ctx, node: Node): { runs: Run[]; style: TextStyle } {
  const v = (name: string) => paramValue(ctx, node, name);
  const text = String(v("text"));
  const style = fitStyle(
    text,
    {
      font: { family: str(v("font"), "Inter"), weight: num(v("weight"), 600), size: num(v("size"), 64) },
      tracking: num(v("tracking")),
      leading: num(v("leading"), 1.2),
      align: oneOf(v("align"), ["left", "center", "right"] as const, "left"),
      maxWidth: num(v("maxWidth")),
      overflow: oneOf(v("overflow"), ["none", "shrink", "wrap"] as const, "none"),
    },
    ctx.measure,
  );
  return { runs: layoutLines(text, style, ctx.measure), style };
}

/** [width, height] of what a node draws, in its own space: the text box, or a shape's size. */
function boundsOfNode(ctx: Ctx, node: Node): [number, number] {
  if (node.type === "Text") {
    const { runs, style } = textLayout(ctx, node);
    const [, , w, h] = runsBox(runs, style.font.size);
    return [w, h];
  }
  if (node.type === "Shape" || node.type === "Scene3D") return vec2(paramValue(ctx, node, "size"), node.type === "Shape" ? [400, 120] : [1920, 1080]);
  return [0, 0];
}
const boundsOf = boundsOfNode;

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

  const ports: readonly string[] = specOf(node)?.ports ?? [];
  const inputs = (): Part[] =>
    ctx.net.wires.filter((w) => w.to.node === id && !ports.includes(w.to.port)).flatMap((w) => evalNode(ctx, w.from.node, [...stack, id]));
  const isLayer = specOf(node)?.category === "layer";
  let out: Part[];

  if (!node.enabled) out = isLayer ? [] : inputs();
  else
    switch (node.type) {
      case "Text": {
        const layer = makeLayer(ctx, node);
        out = [part(layer, { kind: "text", ...textLayout(ctx, node) })];
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
        out = [part(layer, ctx.flatten === false ? { kind: "subnet", subnet: node.subnet ?? "" } : { kind: "container", children: layer.visible ? evalSubnet(ctx, node) : [] })];
        break;
      }
      case "Scene3D": {
        const layer = makeLayer(ctx, node);
        out = layer.visible ? [part(layer, { kind: "scene3d", subnet: node.subnet ?? "", scene: evalScene3D(ctx, node) })] : [part(layer, { kind: "shape" })];
        break;
      }
      case "Text3D":
      case "Shape3D":
      case "Camera":
      case "Light":
      case "Material":
      case "LinearField":
      case "SphericalField":
      case "NoiseField":
        out = []; // only meaningful inside a 3D scene (evalScene3D reads them)
        break;
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

/** Promoted values of a Subnet instance, as overrides for the nodes inside (evaluated at the parent's time). */
function instanceOverrides(ctx: Ctx, node: Node, net: Network): Map<string, Record<string, Param>> {
  const overrides = new Map<string, Record<string, Param>>();
  for (const pr of net.promoted ?? []) {
    const raw = ctx.overrides.get(node.id)?.[pr.id] ?? node.params[pr.id];
    if (!raw) continue; // not set on this instance: the inner value stands
    const rec = overrides.get(pr.target.node) ?? {};
    rec[pr.target.param] = { value: evaluateParam(resolveBrand(raw, ctx.brand), ctx.t) };
    overrides.set(pr.target.node, rec);
  }
  return overrides;
}

function evalSubnet(ctx: Ctx, node: Node): Drawable[] {
  const net = ctx.doc.networks.find((n) => n.id === node.subnet);
  if (!net) return [];
  const overrides = instanceOverrides(ctx, node, net);
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

/* ---------- 3D scenes ---------- */

const vec3 = (v: Value, d: [number, number, number] = [0, 0, 0]): [number, number, number] =>
  Array.isArray(v) && v.length >= 3 ? [v[0]!, v[1]!, (v as number[])[2]!] : d;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** The scene's own settings, read off the Scene3D node (in the parent's context). */
function sceneSettings(ctx: Ctx, node: Node): Omit<Scene3D, "camera" | "lights" | "objects"> {
  const v = (name: string) => paramValue(ctx, node, name);
  return {
    size: vec2(v("size"), [1920, 1080]),
    environment: oneOf(v("environment"), ["studio-soft", "studio-hard", "overcast", "none"] as const, "studio-soft"),
    environmentIntensity: Math.max(0, num(v("environmentIntensity"), 1)),
    shadows: v("shadows") !== false,
    ambientOcclusion: clamp01(num(v("ambientOcclusion"), 0.5)),
  };
}

function evalScene3D(ctx: Ctx, node: Node): Scene3D {
  const net = ctx.doc.networks.find((n) => n.id === node.subnet);
  const settings = sceneSettings(ctx, node);
  if (!net) return { ...settings, camera: defaultCamera(settings.size), lights: [], objects: [] };
  const span = node.timing ? node.timing.out - node.timing.in : net.comp?.duration ?? ctx.span;
  const inner: Ctx = {
    doc: ctx.doc,
    net,
    t: ctx.t - (node.timing?.in ?? 0),
    memo: new Map(),
    brand: ctx.brand,
    measure: ctx.measure,
    span,
    instance: [...ctx.instance, node.id],
    overrides: instanceOverrides(ctx, node, net),
  };
  return buildScene(inner, settings);
}

function defaultCamera(size: [number, number]): Camera3D {
  return { position: [0, 0, zoomFor(size[0], 50)], target: [0, 0, 0], lens: 50, fov: verticalFov(50, size[0], size[1]), roll: 0 };
}

/** The material wired into a node's `material` port, at the context's time; else a plastic in the node's fill. */
function materialOf(ctx: Ctx, node: Node): Material3D {
  const wire = ctx.net.wires.find((w) => w.to.node === node.id && w.to.port === "material");
  const m = wire && ctx.net.nodes.find((n) => n.id === wire.from.node && n.type === "Material" && n.enabled);
  if (!m) {
    return { kind: "plastic", color: str(paramValue(ctx, node, "fill"), "#FFFFFF"), roughness: 0.45, metalness: 0, transmission: 0, ior: 1.5, thickness: 0.5, clearcoat: 0, iridescence: 0, emission: 0, grain: 0 };
  }
  const v = (name: string, d: number) => num(paramValue(ctx, m, name), d);
  return {
    node: m.id,
    kind: oneOf(paramValue(ctx, m, "kind"), ["solid", "plastic", "plaster", "glass", "metal", "iridescent", "emissive"] as const, "plastic"),
    color: str(paramValue(ctx, m, "color"), "#FFFFFF"),
    roughness: clamp01(v("roughness", 0.45)),
    metalness: clamp01(v("metalness", 0)),
    transmission: clamp01(v("transmission", 0)),
    ior: Math.min(2.333, Math.max(1, v("ior", 1.5))),
    thickness: clamp01(v("thickness", 0.5)),
    clearcoat: clamp01(v("clearcoat", 0)),
    iridescence: clamp01(v("iridescence", 0)),
    emission: Math.max(0, v("emission", 0)),
    grain: clamp01(v("grain", 0)),
  };
}

/**
 * Everything in a 3D network at the context's time: objects and lights reached from the output
 * (main inputs, wire order), the first visible camera. Nodes outside their in/out are left out.
 */
function buildScene(ctx: Ctx, settings: Omit<Scene3D, "camera" | "lights" | "objects">): Scene3D {
  const net = ctx.net;
  const order: Node[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = net.nodes.find((n) => n.id === id);
    if (!node) return;
    const ports: readonly string[] = specOf(node)?.ports ?? [];
    for (const w of net.wires) if (w.to.node === id && !ports.includes(w.to.port)) visit(w.from.node);
    if (node.enabled) order.push(node);
  };
  visit(net.output);
  const visible = (n: Node) => ctx.t >= (n.timing?.in ?? 0) && ctx.t < (n.timing?.out ?? Infinity);
  const idOf = (n: Node) => [...ctx.instance, n.id].join("/");

  const objects: Object3D[] = [];
  const lights: Light3D[] = [];
  let camera: Camera3D | undefined;
  for (const node of order.filter(visible)) {
    const v = (name: string) => paramValue(ctx, node, name);
    if (node.type === "Text3D" || node.type === "Shape3D") {
      const matrix = objectMatrix(vec3(v("position")), vec3(v("rotation")), vec3(v("scale"), [100, 100, 100]), vec3(v("anchor")));
      const base = {
        id: idOf(node),
        node: node.id,
        matrix,
        opacity: clamp01(num(v("opacity"), 100) / 100),
        depth: Math.max(0, num(v("depth"), 40)),
        bevel: Math.max(0, num(v("bevel"), 2)),
        material: materialOf(ctx, node),
      };
      if (node.type === "Text3D") {
        const { runs, style } = textLayout3D(ctx, node);
        const [x, y, w, h] = runsBox(runs, style.font.size);
        const ox = style.align === "left" ? x : style.align === "right" ? x + w : x + w / 2;
        objects.push({ ...base, kind: "text", runs, font: style.font, tracking: style.tracking, origin: [ox, y + h / 2] });
      } else {
        objects.push({
          ...base,
          kind: "shape",
          shape: oneOf(v("shape"), ["rect", "ellipse", "path"] as const, "rect"),
          size: vec2(v("size"), [400, 400]),
          radius: Math.max(0, num(v("radius"))),
          path: str(v("path")),
        });
      }
    } else if (node.type === "Light") {
      lights.push({
        id: idOf(node),
        node: node.id,
        kind: oneOf(v("kind"), ["directional", "point", "spot"] as const, "directional"),
        color: str(v("color"), "#FFFFFF"),
        intensity: Math.max(0, num(v("intensity"), 2)),
        position: vec3(v("position"), [-900, 1200, 1600]),
        target: vec3(v("target")),
        castShadow: v("castShadow") !== false,
        softness: clamp01(num(v("softness"), 0.5)),
        angle: Math.min(89, Math.max(1, num(v("angle"), 40))),
      });
    } else if (node.type === "Camera" && !camera) {
      const lens = Math.max(5, num(v("lens"), 50));
      camera = {
        node: node.id,
        position: vec3(v("position"), [0, 0, zoomFor(settings.size[0], lens)]),
        target: vec3(v("target")),
        lens,
        fov: verticalFov(lens, settings.size[0], settings.size[1]),
        roll: num(v("roll")),
      };
    }
  }
  attachClones(ctx, order.filter(visible), objects);
  return { ...settings, camera: camera ?? defaultCamera(settings.size), lights, objects };
}

const EFFECTORS = new Set(["Random", "Plain", "Step", "Reveal"]);

/** A field node's spec at the context's time. */
function fieldSpec(ctx: Ctx, f: Node): FieldSpec | undefined {
  const v = (name: string) => paramValue(ctx, f, name);
  const invert = v("invert") === true;
  if (f.type === "LinearField") {
    const dir = oneOf(v("direction"), ["x", "-x", "y", "-y", "z", "-z"] as const, "x");
    return { kind: "linear", position: vec3(v("position")), axis: ("xyz".indexOf(dir.slice(-1)) as 0 | 1 | 2), sign: dir.startsWith("-") ? -1 : 1, length: num(v("length"), 600), invert };
  }
  if (f.type === "SphericalField") return { kind: "spherical", position: vec3(v("position")), radius: num(v("radius"), 400), falloff: num(v("falloff"), 0.5), invert };
  if (f.type === "NoiseField") return { kind: "noise", scale: num(v("scale"), 400), speed: num(v("speed"), 0.5), seed: num(v("seed"), 1), t: ctx.t, invert };
  return undefined;
}

/** Palette text ("#ff0000, brand:primary") as resolved colours. */
function palette(ctx: Ctx, text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((x) => (x.startsWith("brand:") ? ctx.brand.get(x.slice(6)) ?? "" : x))
    .filter((x) => /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(x));
}

function effectorSpec(ctx: Ctx, e: Node): EffectorSpec {
  const v = (name: string) => paramValue(ctx, e, name);
  const common = { position: vec3(v("position")), rotation: vec3(v("rotation")), scale: num(v("scale")), strength: num(v("strength"), 1) };
  if (e.type === "Random") return { kind: "random", ...common, palette: palette(ctx, str(v("palette"))), seed: num(v("seed"), 1) };
  return { kind: e.type === "Step" ? "step" : "plain", ...common };
}

/**
 * Cloners: each enabled Cloner clones the object wired into it; the effectors wired after it (in a
 * chain) change the clones, weighted by the field wired into each. The object then draws as its clones.
 */
function attachClones(ctx: Ctx, nodes: Node[], objects: Object3D[]) {
  const net = ctx.net;
  for (const cl of nodes.filter((n) => n.type === "Cloner")) {
    const src = net.wires.find((w) => w.to.node === cl.id && w.to.port === "in")?.from.node;
    const obj = objects.find((o) => o.node === src);
    if (!obj) continue;
    const v = (name: string) => paramValue(ctx, cl, name);
    const clonerM = objectMatrix(vec3(v("position")), vec3(v("rotation")), vec3(v("scale"), [100, 100, 100]), vec3(v("anchor")));
    let clones = makeClones({
      mode: oneOf(v("mode"), ["grid", "linear", "radial"] as const, "grid"),
      count: vec3(v("count"), [3, 3, 1]),
      spacing: vec3(v("spacing"), [300, 200, 200]),
      step: vec3(v("step"), [250, 0, 0]),
      stepRotation: vec3(v("stepRotation")),
      radius: num(v("radius"), 400),
      plane: oneOf(v("plane"), ["xy", "xz", "zy"] as const, "xy"),
      align: v("align") !== false,
      rowSlide: num(v("rowSlide")),
    });
    // effectors downstream of the cloner, in wire order
    const seen = new Set<string>();
    for (let at = cl.id; ; ) {
      const next = net.wires.map((w) => (w.from.node === at && w.to.port === "in" ? net.nodes.find((n) => n.id === w.to.node) : undefined)).find((n) => n && EFFECTORS.has(n.type));
      if (!next || seen.has(next.id)) break;
      seen.add(next.id);
      at = next.id;
      if (!next.enabled) continue;
      if (next.type === "Reveal") {
        const ps = phaseSpec(ctx, next);
        const e = (name: string) => paramValue(ctx, next, name);
        clones = applyReveal(clones, { phase: ps, delays: phaseDelays(ps, clones.length), position: vec3(e("offsetPosition"), [0, -300, 0]), rotation: vec3(e("offsetRotation"), [-90, 0, 0]), scale: num(e("offsetScale"), 100) }, ctx.t * 1000, 0, ctx.span * 1000);
        continue;
      }
      const fw = net.wires.find((w) => w.to.node === next.id && w.to.port === "field");
      const fnode = fw && net.nodes.find((n) => n.id === fw.from.node && n.enabled);
      const field = fnode && fieldSpec(ctx, fnode);
      clones = applyEffector(clones, effectorSpec(ctx, next), field ? (c) => fieldWeight(field, clonePoint(clonerM, c)) : () => 1);
    }
    const opacity = clamp01(num(v("opacity"), 100) / 100);
    obj.clones = clones.map((c) => ({ matrix: cloneMatrix(clonerM, c, obj.matrix), ...(c.color ? { color: c.color } : {}), opacity: c.opacity * opacity * obj.opacity }));
  }
}

/** Text 3D layout: the 2D text layout (no max width), centred per `align` by the caller. */
function textLayout3D(ctx: Ctx, node: Node): { runs: Run[]; style: TextStyle } {
  const v = (name: string) => paramValue(ctx, node, name);
  const text = String(v("text"));
  const style: TextStyle = {
    font: { family: str(v("font"), "Inter"), weight: num(v("weight"), 700), size: num(v("size"), 200) },
    tracking: num(v("tracking")),
    leading: num(v("leading"), 1.1),
    align: oneOf(v("align"), ["left", "center", "right"] as const, "center"),
    maxWidth: 0,
    overflow: "none",
  };
  return { runs: layoutLines(text, style, ctx.measure), style };
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
        : content.kind === "scene3d"
          ? [0, 0, ...content.scene.size]
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
    case "subnet":
      return [{ ...base, clips: [], kind: "subnet", id: idOf(), matrix: M, subnet: content.subnet }];
    case "scene3d":
      return [{ ...base, kind: "scene3d", id: idOf(), matrix: M, size: content.scene.size, subnet: content.subnet, scene: content.scene }];
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
  const ctx: Ctx = {
    doc,
    net,
    t,
    memo: new Map(),
    brand: new Map((doc.brand?.colors ?? []).map((c) => [c.token, c.value])),
    measure: opts.measure ?? approxMeasure,
    span: opts.span ?? networkSpan(doc, networkId, opts.instance),
    instance: [],
    overrides: new Map(),
    flatten: opts.flattenSubnets,
  };
  if (opts.instance) {
    // Promoted values are evaluated at the parent's time: local time + the instance's in point.
    const parentNet = doc.networks.find((n) => n.id === opts.instance!.network);
    const inst = parentNet?.nodes.find((n) => n.id === opts.instance!.node);
    if (parentNet && inst) {
      const parent = rootCtx(doc, parentNet.id, t + (inst.timing?.in ?? 0), { ...opts, instance: undefined });
      ctx.overrides = instanceOverrides(parent, inst, net);
    }
  }
  return ctx;
}

/** The Scene3D node that opens into this network (the given instance, else the first one in the doc). */
export function sceneOwner(doc: SceneDoc, networkId: string, instance?: { network: string; node: string }): { network: string; node: Node } | undefined {
  if (instance) {
    const node = doc.networks.find((n) => n.id === instance.network)?.nodes.find((n) => n.id === instance.node);
    return node?.type === "Scene3D" && node.subnet === networkId ? { network: instance.network, node } : undefined;
  }
  for (const n of doc.networks) for (const node of n.nodes) if (node.type === "Scene3D" && node.subnet === networkId) return { network: n.id, node };
  return undefined;
}

export function evaluateFrame(doc: SceneDoc, networkId: string, t: number, opts: EvaluateOptions = {}): Drawable[] {
  const ctx = rootCtx(doc, networkId, t, opts);
  const owner = sceneOwner(doc, networkId, opts.instance);
  if (owner) {
    // Inside a 3D scene: the whole network is one scene drawable, settings from its Scene3D node.
    const parent = rootCtx(doc, owner.network, t + (owner.node.timing?.in ?? 0), { ...opts, instance: undefined });
    const scene = buildScene(ctx, sceneSettings(parent, owner.node));
    return [
      { kind: "scene3d", id: `${networkId}#scene`, network: networkId, node: owner.node.id, instance: [], part: 0, parts: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: 1, blur: 0, clips: [], size: scene.size, subnet: networkId, scene },
    ];
  }
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
