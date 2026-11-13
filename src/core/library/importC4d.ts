/**
 * Cinema 4D dump (`tools/c4d/mb_export.py` → c4d.json, mb-c4d-dump/0.2) to a scene doc.
 * Deterministic and pure, like `importAe`: whatever can't be carried over is listed in `notes`.
 *
 * Result: a "main" comp whose one Subnet is the asset; that network holds one Scene3D layer, which
 * opens into the 3D network (Text3D, Shape3D, Cloner, Camera, Light, Material).
 *
 * Space: C4D is y up and left-handed (+z away from the viewer); ours is y up and right-handed
 * (+z towards the camera). Every point and direction flips z. C4D units (cm) are used as px: with
 * the scene's camera imported, the picture is the same whatever the unit.
 *
 * Rotation: ours is Euler XYZ in degrees. Static objects use the dumped matrix (exact, no
 * convention involved). Keyed rotation has to go through C4D's HPB angles, R = Ry(h) · Rx(p) · Rz(b);
 * which way each angle counts is read from the dump (`fitSigns`: the choice that reproduces the
 * objects' own matrices), not assumed.
 */
import { validateDoc, type Key, type Network, type Node, type Param, type SceneDoc, type Value, type Wire } from "../scene";
import { bezierToEase } from "./aeEase";
import { hex, ids, r4, slug, weightOf } from "./util";

/* ---------- the dump (only what the importer reads) ---------- */

type V3 = [number, number, number];
export interface C4dMatrix {
  off: V3;
  v1: V3;
  v2: V3;
  v3: V3;
}
export interface C4dKey {
  t: number;
  v: number;
  interp: "linear" | "step" | "spline" | string;
  /** Tangents, relative to the key: time left (≤ 0) and right (≥ 0) in seconds, and their values. */
  tl: number;
  vl: number;
  tr: number;
  vr: number;
}
export interface C4dTrack {
  name: string;
  /** "position.x", "rotation.h", "scale.z"… or null for other parameters. */
  channel: string | null;
  keys: C4dKey[];
}
export interface C4dObject {
  name: string;
  kind: "null" | "cube" | "sphere" | "extrude" | "rect-spline" | "circle-spline" | "text-spline" | "camera" | "light" | "cloner" | "motext" | "other";
  known: Record<string, unknown>;
  ml: C4dMatrix;
  mg: C4dMatrix;
  type: string;
  pos: V3;
  /** HPB, radians. */
  rot: V3;
  scale: V3;
  renderVisible?: number;
  materials: { material: string }[];
  tracks: C4dTrack[];
  children: C4dObject[];
}
export interface C4dMaterial {
  name: string;
  type: string;
  known?: { color?: V3; luminance?: V3; transparency?: number; reflection?: boolean };
  tracks?: C4dTrack[];
}
export interface C4dDump {
  format: string;
  /** The scene file's name. */
  scene: string;
  fps: number;
  minTime: number;
  maxTime: number;
  render: { width: number; height: number; fps: number };
  activeCamera: string | null;
  objects: C4dObject[];
  materials: C4dMaterial[];
}

export interface C4dImport {
  doc: SceneDoc;
  /** Network id of the asset. */
  asset: string;
  /** Promoted control ids (none yet: 3D imports don't promote controls). */
  controls: string[];
  notes: string[];
}

/* ---------- matrices ---------- */

/** Rotation/scale part as columns, plus offset: p' = cols · p + off. */
interface M {
  x: V3;
  y: V3;
  z: V3;
  o: V3;
}
const deg = (r: number) => (r * 180) / Math.PI;
const len = (v: V3) => Math.hypot(v[0], v[1], v[2]);
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) <= eps;

/** A C4D matrix in our space: z flipped on both sides (M · A · M with M = diag(1, 1, -1)). */
const ours = (m: C4dMatrix): M => ({ x: [m.v1[0], m.v1[1], -m.v1[2]], y: [m.v2[0], m.v2[1], -m.v2[2]], z: [-m.v3[0], -m.v3[1], m.v3[2]], o: [m.off[0], m.off[1], -m.off[2]] });

/** Euler XYZ in degrees (three.js order) of a rotation given as unit columns. */
function eulerXYZ(x: V3, y: V3, z: V3): V3 {
  const m13 = Math.min(1, Math.max(-1, z[0]));
  return Math.abs(m13) < 0.9999999 ? [deg(Math.atan2(-z[1], z[2])), deg(Math.asin(m13)), deg(Math.atan2(-y[0], x[0]))] : [deg(Math.atan2(y[2], y[1])), deg(Math.asin(m13)), 0];
}

/** Position, rotation (deg XYZ) and scale (%) of a matrix in our space. */
function decompose(m: M): { position: V3; rotation: V3; scale: V3 } {
  const s: V3 = [len(m.x) || 1, len(m.y) || 1, len(m.z) || 1];
  return { position: m.o, rotation: eulerXYZ(mul(m.x, 1 / s[0]), mul(m.y, 1 / s[1]), mul(m.z, 1 / s[2])), scale: mul(s, 100) };
}

type Signs = [number, number, number];

/** Rotation columns of Ry(h) · Rx(p) · Rz(b) in Cinema 4D's own space, each angle with its sign. */
function c4dColumns(h: number, p: number, b: number, sign: Signs = [1, 1, 1]): [V3, V3, V3] {
  const [ch, sh, cp, sp, cb, sb] = [Math.cos(sign[0] * h), Math.sin(sign[0] * h), Math.cos(sign[1] * p), Math.sin(sign[1] * p), Math.cos(sign[2] * b), Math.sin(sign[2] * b)];
  return [
    [ch * cb + sh * sp * sb, cp * sb, -sh * cb + ch * sp * sb],
    [-ch * sb + sh * sp * cb, cp * cb, sh * sb + ch * sp * cb],
    [sh * cp, -sp, ch * cp],
  ];
}

/** C4D HPB (radians) as rotation columns in our space (z flipped on both sides). */
function hpbColumns(h: number, p: number, b: number, sign: Signs): [V3, V3, V3] {
  const [x, y, z] = c4dColumns(h, p, b, sign);
  return [[x[0], x[1], -x[2]], [y[0], y[1], -y[2]], [-z[0], -z[1], z[2]]];
}

const SIGNS: Signs[] = [[1, 1, 1], [-1, 1, 1], [1, -1, 1], [1, 1, -1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1]];

/**
 * Which way Cinema 4D counts each HPB angle, read from the dump itself: every object comes with
 * both its HPB values and its matrix, so the signs that reproduce the matrices are the right ones.
 * Undefined when no sign choice fits (a rotation order other than HPB).
 */
function fitSigns(objects: { rot: V3; ml: C4dMatrix }[]): Signs | undefined {
  let fits = SIGNS;
  for (const o of objects) {
    if (o.rot.every((r) => near(r, 0))) continue;
    const cols = [o.ml.v1, o.ml.v2, o.ml.v3].map((v) => mul(v, 1 / (len(v) || 1)));
    fits = fits.filter((s) => c4dColumns(o.rot[0], o.rot[1], o.rot[2], s).every((c, i) => c.every((x, j) => near(x, cols[i]![j]!, 1e-3))));
  }
  return fits[0];
}

const isIdentity = (m: C4dMatrix) => [m.v1, m.v2, m.v3].every((v, i) => v.every((c, j) => near(c, i === j ? 1 : 0))) && m.off.every((c) => near(c, 0));
const isTranslation = (m: C4dMatrix) => [m.v1, m.v2, m.v3].every((v, i) => v.every((c, j) => near(c, i === j ? 1 : 0)));

/* ---------- tracks ---------- */

type Params = Record<string, Param>;
const v3 = (v: V3): Value => [r4(v[0]), r4(v[1]), r4(v[2])];

function easeOf(a: C4dKey, b: C4dKey): string | undefined {
  if (a.interp === "step") return "hold";
  if (a.interp === "linear") return "linear";
  const dt = b.t - a.t, dv = b.v - a.v;
  if (!(dt > 0) || dv === 0) return undefined;
  const x1 = Math.min(1, Math.max(0, a.tr / dt)), x2 = Math.min(1, Math.max(0, 1 + b.tl / dt));
  return bezierToEase([x1, a.vr / dv, x2, 1 + b.vl / dv]);
}

/** A component's value at a time, straight between its keys. */
function sample(keys: C4dKey[] | undefined, t: number, fallback: number): number {
  if (!keys?.length) return fallback;
  if (t <= keys[0]!.t) return keys[0]!.v;
  for (let i = 1; i < keys.length; i++) if (t <= keys[i]!.t) return keys[i - 1]!.v + ((keys[i]!.v - keys[i - 1]!.v) * (t - keys[i - 1]!.t)) / (keys[i]!.t - keys[i - 1]!.t);
  return keys[keys.length - 1]!.v;
}

/**
 * Three per-axis C4D tracks as one vector track: a key wherever any axis has one. Our keys carry
 * one ease for the whole vector, so the first axis that changes decides and a mismatch is noted.
 */
function vecTrack(o: C4dObject, group: "position" | "rotation" | "scale", letters: string, base: V3, conv: (v: V3) => V3, t0: number, where: string, notes: string[]): Key[] | undefined {
  const comps = [...letters].map((l) => o.tracks.find((t) => t.channel === `${group}.${l}`)?.keys);
  if (!comps.some((c) => c && c.length > 1)) return undefined;
  const times = [...new Set(comps.flatMap((c) => c?.map((k) => k.t) ?? []))].sort((a, b) => a - b);
  let mixed = false, early = false;
  const keys = times.map((t, i): Key => {
    const next = times[i + 1];
    let ease: string | undefined;
    if (next !== undefined)
      for (const c of comps) {
        const a = c?.find((k) => k.t === t), b = c?.find((k) => k.t === next);
        const e = a && b ? easeOf(a, b) : undefined;
        if (e && !ease) ease = e;
        else if (e && e !== ease) mixed = true;
        if (c && c.length > 1 && (!a || !b)) mixed = true;
      }
    if (t - t0 < 0) early = true;
    return { t: r4(Math.max(0, t - t0)), v: v3(conv(comps.map((c, d) => sample(c, t, base[d]!)) as V3)), ease: ease ?? "linear" };
  });
  if (mixed) notes.push(`${where} ${group}: its axes have different keys or eases in Cinema 4D; they share one track here, so the motion between keys can differ.`);
  if (early) notes.push(`${where} ${group}: keys before the start of the timeline were moved to 0 s.`);
  return keys;
}

const animated = (o: C4dObject) => o.tracks.some((t) => t.channel && t.keys.length > 1);

/* ---------- objects ---------- */

interface Ctx {
  uid: (wanted: string) => string;
  notes: string[];
  nodes: Node[];
  wires: Wire[];
  t0: number;
  /** Material name → node id, made on first use. */
  material: (name: string) => string | undefined;
  /** Sign of each HPB angle, fitted from the dump. */
  signs: Signs;
}

const wire = (from: string, to: string, port = "in"): Wire => ({ from: { node: from, port: "out" }, to: { node: to, port } });
const num = (v: unknown, d = 0): number => (typeof v === "number" && isFinite(v) ? v : d);
const vec3 = (v: unknown, d: V3 = [0, 0, 0]): V3 => (Array.isArray(v) && v.length >= 3 ? [num(v[0]), num(v[1]), num(v[2])] : d);

/**
 * Transform params of an object. `parent` is the global matrix of what it sits in (undefined at
 * the top); `local` keeps the object's own local transform (inside a Cloner).
 */
function transform(o: C4dObject, parent: C4dMatrix | undefined, parentAnimated: boolean, where: string, ctx: Ctx): Params {
  const p: Params = {};
  const put = (name: string, value: V3, d: V3, keys?: Key[]) => {
    if (keys) p[name] = { value: keys[0]!.v, keys };
    else if (!value.every((c, i) => near(c, d[i]!, 1e-3))) p[name] = { value: v3(value) };
  };
  if (parentAnimated) ctx.notes.push(`${where}: its parent is animated in Cinema 4D; there are no 3D groups here yet, so it stays where it was at export time.`);
  const direct = !parent || isIdentity(parent), shifted = parent && isTranslation(parent);
  if (animated(o) && !parentAnimated && (direct || shifted)) {
    const offset: V3 = parent ? [parent.off[0], parent.off[1], -parent.off[2]] : [0, 0, 0];
    const still = decompose(ours(o.ml));
    put("position", add(still.position, offset), [0, 0, 0], vecTrack(o, "position", "xyz", o.pos, (v) => add([v[0], v[1], -v[2]], offset), ctx.t0, where, ctx.notes));
    put("scale", still.scale, [100, 100, 100], vecTrack(o, "scale", "xyz", o.scale, (v) => mul(v, 100), ctx.t0, where, ctx.notes));
    const turning = [..."hpb"].map((l) => (o.tracks.find((t) => t.channel === `rotation.${l}`)?.keys.length ?? 0) > 1);
    const single = turning.filter(Boolean).length === 1 && o.rot.every((r, i) => turning[i] || near(r, 0));
    const keys = vecTrack(o, "rotation", "hpb", o.rot, single ? (v) => [-ctx.signs[1] * deg(v[1]), -ctx.signs[0] * deg(v[0]), ctx.signs[2] * deg(v[2])] : (v) => eulerXYZ(...hpbColumns(v[0], v[1], v[2], ctx.signs)), ctx.t0, where, ctx.notes);
    if (keys && !single) ctx.notes.push(`${where} rotation: several axes turn at once; it's exact at each key but can differ between keys, and turns over 180° between keys are lost.`);
    put("rotation", still.rotation, [0, 0, 0], keys);
    return p;
  }
  if (animated(o) && !parentAnimated) ctx.notes.push(`${where}: is animated inside a rotated or scaled parent; there are no 3D groups here yet, so it stays where it was at export time.`);
  const d = decompose(ours(parent ? o.mg : o.ml));
  put("position", d.position, [0, 0, 0]);
  put("rotation", d.rotation, [0, 0, 0]);
  put("scale", d.scale, [100, 100, 100]);
  return p;
}

/** Text params shared by MoText and an extruded text spline. */
function textParams(k: Record<string, unknown>, where: string, notes: string[]): Params {
  const font = (k.font ?? {}) as { family?: string; name?: string };
  const p: Params = { text: { value: String(k.text ?? "Text").replace(/\r\n?/g, "\n") }, size: { value: r4(num(k.height, 200)) }, align: { value: k.align === "left" || k.align === "right" ? k.align : "center" } };
  if (font.family) (p.font = { value: font.family }), (p.weight = { value: weightOf(font.name ?? "") });
  notes.push(`${where}: text is placed from its baseline in Cinema 4D and centred on its origin here, so it can sit a little off${font.family ? `; font "${font.family}" must be in the app` : ""}.`);
  return p;
}

/** The node params that draw this object, or undefined when it isn't something we draw. */
function geometry(o: C4dObject, where: string, notes: string[]): { type: "Text3D" | "Shape3D"; params: Params } | undefined {
  const k = o.known;
  if (o.kind === "cube") {
    const s = vec3(k.size, [200, 200, 200]);
    return { type: "Shape3D", params: { shape: { value: "rect" }, size: { value: [r4(s[0]), r4(s[1])] }, depth: { value: r4(s[2]) }, bevel: { value: k.fillet ? r4(num(k.filletRadius)) : 0 } } };
  }
  if (o.kind === "motext") return { type: "Text3D", params: { ...textParams(k, where, notes), depth: { value: r4(Math.abs(num(k.depth, vec3(k.move)[2]))) }, bevel: { value: 0 } } };
  if (o.kind === "extrude") {
    const spline = o.children.find((c) => c.kind === "rect-spline" || c.kind === "circle-spline" || c.kind === "text-spline");
    if (!spline) {
      notes.push(`${where}: extrudes a spline that isn't a rectangle, circle or text; skipped.`);
      return undefined;
    }
    if (!isIdentity(spline.ml)) notes.push(`${where}: the spline inside the Extrude is moved or turned; that offset isn't imported.`);
    if (animated(spline)) notes.push(`${where}: the spline inside the Extrude is animated; that isn't imported.`);
    const depth: Param = { value: r4(Math.abs(num(k.offset, vec3(k.move)[2]))) }, s = spline.known;
    if (spline.kind === "text-spline") return { type: "Text3D", params: { ...textParams(s, where, notes), depth, bevel: { value: 0 } } };
    if (spline.kind === "rect-spline") return { type: "Shape3D", params: { shape: { value: "rect" }, size: { value: [r4(num(s.width, 400)), r4(num(s.height, 400))] }, radius: { value: s.rounding ? r4(num(s.radius)) : 0 }, depth, bevel: { value: 0 } } };
    const r = num(s.radius, 200);
    return { type: "Shape3D", params: { shape: { value: "ellipse" }, size: { value: [r4(r * 2), r4((s.ellipse ? num(s.radiusY, r) : r) * 2)] }, depth, bevel: { value: 0 } } };
  }
  return undefined;
}

function cloner(o: C4dObject, where: string, notes: string[], signs: Signs): Params | undefined {
  const k = o.known;
  if (k.mode === "linear") {
    const step = vec3(k.linearStep), rot = vec3(k.linearRotation);
    const p: Params = { mode: { value: "linear" }, count: { value: [Math.max(1, Math.round(num(k.linearCount, 3))), 1, 1] }, step: { value: v3([step[0], step[1], -step[2]]) } };
    if (rot.some((c) => !near(c, 0))) p.stepRotation = { value: v3(eulerXYZ(...hpbColumns(rot[0], rot[1], rot[2], signs))) };
    return p;
  }
  if (k.mode === "radial") return { mode: { value: "radial" }, count: { value: [Math.max(1, Math.round(num(k.radialCount, 8))), 1, 1] }, radius: { value: r4(num(k.radialRadius, 400)) }, plane: { value: k.radialPlane === "xz" || k.radialPlane === "zy" ? k.radialPlane : "xy" } };
  if (k.mode === "grid") {
    const n = vec3(k.gridCount, [3, 3, 1]).map((c) => Math.max(1, Math.round(c))) as V3, size = vec3(k.gridSize, [200, 200, 200]);
    // "endpoint": the size spans the whole grid; "per-step": it is the gap between clones
    const gap = k.gridMode === "per-step" ? size : (size.map((s, i) => (n[i]! > 1 ? s / (n[i]! - 1) : s)) as V3);
    if (k.gridMode !== "per-step" && k.gridMode !== "endpoint") notes.push(`${where}: the grid's size mode isn't known; its size is read as the whole grid.`);
    return { mode: { value: "grid" }, count: { value: n }, spacing: { value: v3(gap) } };
  }
  notes.push(`${where}: cloner mode "${String(k.mode)}" isn't imported (linear, radial and grid are); skipped.`);
  return undefined;
}

/** Adds an object (and what hangs under it) to the 3D network; returns the node to wire into the scene. */
function build(o: C4dObject, parent: C4dMatrix | undefined, parentAnimated: boolean, inherited: string | undefined, ctx: Ctx, inCloner = false): string[] {
  const where = `"${o.name}"`, tag = o.materials[o.materials.length - 1]?.material ?? inherited;
  const base = (id: string, type: string, params: Params): Node => ({ id, type, name: o.name, enabled: o.renderVisible !== 1, params, ui: { x: 0, y: 0 } });
  // inside a Cloner an object keeps its own local transform; elsewhere parents are flattened into it
  const xf = () => (inCloner ? transform(o, undefined, false, where, ctx) : transform(o, parent, parentAnimated, where, ctx));
  const withMaterial = (id: string) => {
    const m = tag && ctx.material(tag);
    if (m) ctx.wires.push(wire(m, id, "material"));
  };
  if (o.tracks.some((t) => !t.channel && t.keys.length > 1)) ctx.notes.push(`${where}: animated parameters other than position, rotation and scale aren't imported (${[...new Set(o.tracks.filter((t) => !t.channel).map((t) => t.name))].join(", ")}).`);

  if (o.kind === "camera" || o.kind === "light") return []; // placed by `camera` and `lights`
  if (o.kind === "cloner") {
    const params = cloner(o, where, ctx.notes, ctx.signs), source = o.children.find((c) => c.kind !== "null" || c.children.length);
    if (!params || !source) {
      if (params) ctx.notes.push(`${where}: has nothing to clone; skipped.`);
      return [];
    }
    if (o.children.filter((c) => c !== source).length) ctx.notes.push(`${where}: clones several objects in turn in Cinema 4D; only "${source.name}" is cloned here.`);
    const [inner] = build(source, undefined, false, tag, ctx, true);
    if (!inner) return [];
    const id = ctx.uid(slug(o.name, "cloner"));
    const placed = xf();
    if (params.mode!.value === "linear") {
      // Cinema 4D starts a line at the cloner; ours is centred on it. Move it half its length along.
      const n = (params.count!.value as number[])[0]!, step = params.step!.value as V3, m = ours(o.ml), half = (n - 1) / 2;
      const shift = add(add(mul(m.x, step[0] * half), mul(m.y, step[1] * half)), mul(m.z, step[2] * half));
      const moved = (v: Value): Value => v3(add(v as V3, shift));
      const at = placed.position ?? { value: [0, 0, 0] };
      placed.position = { value: moved(at.value), ...(at.keys ? { keys: at.keys.map((k) => ({ ...k, v: moved(k.v) })) } : {}) };
      if (placed.rotation?.keys || placed.scale?.keys) ctx.notes.push(`${where}: a line of clones starts at the cloner in Cinema 4D and is centred on it here; with the cloner turning or scaling, the line's position can differ.`);
      if (params.stepRotation) ctx.notes.push(`${where}: the clones' step rotation counts from the first clone in Cinema 4D and from the middle one here; turn the cloner to match.`);
    }
    ctx.nodes.push(base(id, "Cloner", { ...params, ...placed }));
    ctx.wires.push(wire(inner, id));
    ctx.notes.push(`${where}: effectors and fields on the cloner aren't imported; add them here.`);
    return [id];
  }
  const g = geometry(o, where, ctx.notes);
  if (g) {
    const id = ctx.uid(slug(o.name, "object"));
    ctx.nodes.push(base(id, g.type, { ...g.params, ...xf() }));
    withMaterial(id);
    return [id];
  }
  if (o.kind !== "null" && o.kind !== "extrude") ctx.notes.push(`${where}: ${o.type} objects aren't imported${o.children.length ? "; what's inside it is" : "; skipped"}.`);
  if (inCloner && o.children.length) ctx.notes.push(`${where}: a group inside a cloner isn't imported as a group; its first object is cloned.`);
  // a null or unknown container: its children are placed in the scene with its transform folded in
  const outs = o.children.flatMap((c) => build(c, inCloner ? undefined : o.mg, parentAnimated || animated(o), tag, ctx, inCloner));
  return inCloner ? outs.slice(0, 1) : outs;
}

const flat = (objects: C4dObject[]): C4dObject[] => objects.flatMap((o) => [o, ...flat(o.children)]);
/** Whether anything above `target` in the tree is animated. */
const underAnimated = (objects: C4dObject[], target: C4dObject, moving = false): boolean | undefined => {
  for (const o of objects) {
    if (o === target) return moving;
    const r = underAnimated(o.children, target, moving || animated(o));
    if (r !== undefined) return r;
  }
  return undefined;
};

/** Converts a dump. Throws when it isn't one, or when the result isn't a valid doc (an importer bug). */
export function importC4d(dump: C4dDump): C4dImport {
  if (!dump || typeof dump.format !== "string" || !dump.format.startsWith("mb-c4d-dump/") || !Array.isArray(dump.objects)) throw new Error("This isn't a Cinema 4D dump from tools/c4d/mb_export.py (no mb-c4d-dump format).");
  if (dump.format === "mb-c4d-dump/0.1") throw new Error("This dump is from the first version of mb_export.py; export it again with the current script (it writes object kinds and matrices the importer needs).");
  const notes: string[] = [], uid = ids(), nodes: Node[] = [], wires: Wire[] = [];
  const merge = uid("merge");
  const made = new Map<string, string | undefined>();
  const material = (name: string): string | undefined => {
    if (made.has(name)) return made.get(name);
    const m = dump.materials.find((x) => x.name === name), k = m?.known ?? {};
    let id: string | undefined;
    if (m) {
      id = uid(slug(`${name}-material`, "material"));
      const params: Params = { kind: { value: "plastic" }, color: { value: hex(k.color ?? [1, 1, 1]) } };
      if (k.luminance && k.luminance.some((c) => c > 0.01)) (params.kind = { value: "emissive" }), (params.color = { value: hex(k.luminance) }), (params.emission = { value: 1 });
      else if (num(k.transparency) > 0.01) (params.kind = { value: "glass" }), (params.transmission = { value: r4(Math.min(1, num(k.transparency))) });
      else if (k.reflection) params.roughness = { value: 0.25 };
      if (!k.color && !k.luminance) notes.push(`Material "${name}" (${m.type}): its colour couldn't be read (a node or Redshift material?); it's imported as white plastic. Set the look here.`);
      else notes.push(`Material "${name}": only its colour${k.reflection ? ", a glossy finish" : ""}${params.kind!.value !== "plastic" ? ` and that it is ${String(params.kind!.value)}` : ""} are imported; check the look.`);
      if (m.tracks?.some((t) => t.keys.length > 1)) notes.push(`Material "${name}": its animation isn't imported.`);
      nodes.push({ id, type: "Material", name, enabled: true, params, ui: { x: 0, y: 0 } });
    }
    made.set(name, id);
    return id;
  };
  const fitted = fitSigns(flat(dump.objects));
  if (!fitted && flat(dump.objects).some((o) => o.tracks.some((t) => t.channel?.startsWith("rotation") && t.keys.length > 1))) notes.push("The objects' rotation values don't match their matrices in any way the importer knows (a rotation order other than HPB?). Keyed rotations may be wrong; check them against the reference.");
  const t0 = num(dump.minTime), ctx: Ctx = { uid, notes, nodes, wires, t0, material, signs: fitted ?? [1, 1, 1] };
  for (const o of dump.objects) for (const out of build(o, undefined, false, undefined, ctx)) wires.push(wire(out, merge));

  const all = flat(dump.objects);
  // camera: the active one, else the first; it looks along its own +z in Cinema 4D
  const cams = all.filter((o) => o.kind === "camera"), cam = cams.find((o) => o.name === dump.activeCamera) ?? cams[0];
  if (cam) {
    const m = ours(cam.mg), forward: V3 = mul([cam.mg.v3[0], cam.mg.v3[1], -cam.mg.v3[2]], 1 / (len(cam.mg.v3) || 1));
    const reach = dot(mul(m.o, -1), forward), distance = reach > 1 ? reach : len(m.o) || 1000;
    const aperture = num(cam.known.aperture, 36), id = uid(slug(cam.name, "camera"));
    const params: Params = { position: { value: v3(m.o) }, target: { value: v3(add(m.o, mul(forward, distance))) }, lens: { value: r4(Math.min(400, Math.max(5, (num(cam.known.focalLength, 36) * 36) / aperture))) } };
    const moving = underAnimated(dump.objects, cam);
    if (animated(cam) && !moving && all.includes(cam) && dump.objects.includes(cam)) {
      const keys = vecTrack(cam, "position", "xyz", cam.pos, (v) => [v[0], v[1], -v[2]], t0, `"${cam.name}"`, notes);
      if (keys) params.position = { value: keys[0]!.v, keys };
      notes.push(`"${cam.name}": the camera's position keys are imported and it keeps looking at the same point; its rotation keys aren't imported.`);
    } else if (animated(cam) || moving) notes.push(`"${cam.name}": the camera's animation isn't imported; it stays where it was at export time.`);
    if (cams.length > 1) notes.push(`Only the camera "${cam.name}" is imported (${cams.length} in the scene).`);
    nodes.push({ id, type: "Camera", name: cam.name, enabled: true, params, ui: { x: 0, y: 0 } });
    wires.push(wire(id, merge));
  } else notes.push("The scene has no camera object, so the default camera is used here; the framing will differ from Cinema 4D's editor view.");
  for (const l of all.filter((o) => o.kind === "light")) {
    const m = ours(l.mg), forward: V3 = mul([l.mg.v3[0], l.mg.v3[1], -l.mg.v3[2]], 1 / (len(l.mg.v3) || 1)), k = l.known, id = uid(slug(l.name, "light"));
    const kind = k.type === "spot" || k.type === "directional" ? k.type : "point";
    if (k.type !== "point" && k.type !== "spot" && k.type !== "directional") notes.push(`"${l.name}": light type "${String(k.type)}" is imported as a point light.`);
    const params: Params = { kind: { value: kind }, color: { value: hex(k.color ?? [1, 1, 1]) }, intensity: { value: r4(Math.min(20, num(k.brightness, 1) * 2)) }, position: { value: v3(m.o) }, target: { value: v3(add(m.o, mul(forward, 1000))) }, castShadow: { value: k.shadow !== "none" } };
    if (kind === "spot" && typeof k.outerAngle === "number") params.angle = { value: r4(Math.min(89, Math.max(1, deg(k.outerAngle) / 2))) };
    if (animated(l) || underAnimated(dump.objects, l)) notes.push(`"${l.name}": the light's animation isn't imported.`);
    nodes.push({ id, type: "Light", name: l.name, enabled: l.renderVisible !== 1, params, ui: { x: 0, y: 0 } });
    wires.push(wire(id, merge));
  }
  if (all.some((o) => o.kind === "light")) notes.push("Light brightness is matched roughly (100 % = intensity 2); compare with the reference.");
  nodes.push({ id: merge, type: "Merge", name: "Merge", enabled: true, params: {}, ui: { x: 0, y: 0 } });
  // columns: materials and sources left, what they feed to the right
  const depth = new Map<string, number>();
  const depthOf = (n: string): number => depth.get(n) ?? (depth.set(n, 0), depth.set(n, Math.max(0, ...wires.filter((w) => w.to.node === n).map((w) => depthOf(w.from.node) + 1))), depth.get(n)!);
  const rows = new Map<number, number>();
  for (const n of nodes) {
    const d = depthOf(n.id), row = rows.get(d) ?? 0;
    rows.set(d, row + 1);
    n.ui = { x: d * 240, y: row * 120 };
  }

  const name = dump.scene.replace(/\.c4d$/i, "") || "Cinema 4D scene";
  const netIds = ids();
  netIds("main");
  const assetId = netIds(slug(name, "asset")), sceneId = netIds(`${assetId.slice(0, 44)}-3d`);
  const { width, height } = dump.render, fps = Math.round((dump.fps || dump.render.fps || 25) * 1000) / 1000;
  const one = (id: string, type: string, extra: Partial<Node> = {}): Node => ({ id, type, name, enabled: true, params: {}, ui: { x: 0, y: 0 }, ...extra });
  const networks: Network[] = [
    { id: "main", name: `${name}_v01`, comp: { width, height, fps, duration: r4(Math.max(1 / fps, num(dump.maxTime) - t0)) }, nodes: [one("asset", "Subnet", { subnet: assetId }), { ...one("out", "Output"), name: "Output", ui: { x: 240, y: 0 } }], wires: [wire("asset", "out")], output: "out" },
    { id: assetId, name, nodes: [one("scene", "Scene3D", { subnet: sceneId, params: { size: { value: [width, height] } } })], wires: [], output: "scene" },
    { id: sceneId, name: `${name} 3D`, nodes, wires, output: merge },
  ];
  const r = validateDoc({ version: 3, name, root: "main", networks, assets: [], batches: [], source: { kind: "blank" } });
  if (!r.ok) throw new Error(`The imported doc isn't valid (an importer bug):\n${r.errors.join("\n")}`);
  return { doc: r.doc, asset: assetId, controls: [], notes: [...new Set(notes)] };
}
