/**
 * After Effects dump (`tools/ae/mb-export.jsx` → ae.json) to a scene doc. Deterministic and pure:
 * the same dump always gives the same doc, and nothing is guessed silently. Whatever can't be
 * carried over is listed in `notes` (they become `asset.json.importNotes`).
 *
 * Shape of the result (`docs/asset-library.md`): a "main" comp whose one Subnet is the asset;
 * the AE comp becomes that Subnet's network, its precomps become Subnets inside it.
 *
 * What maps: text, solids, shape layers (rect, ellipse, path; fill, stroke, trim end), nulls,
 * precomps, parenting, in/out points, the 2D transform, and every keyframe with its ease.
 */
import { validateDoc, type Key, type Network, type Node, type Param, type Promoted, type Role, type SceneDoc, type Value, type Wire } from "../scene";
import { bezierToEase, linearSide, segmentBezier, type AeEase } from "./aeEase";
import { hex, ids, r4, slug, weightOf } from "./util";

/* ---------- the dump (only what the importer reads) ---------- */

export interface AeKey {
  t: number;
  v: unknown;
  inInterp?: "hold" | "linear" | "bezier";
  outInterp?: "hold" | "linear" | "bezier";
  easeIn?: AeEase[];
  easeOut?: AeEase[];
  spatialIn?: number[];
  spatialOut?: number[];
}
export interface AeProp {
  name: string;
  matchName: string;
  enabled?: boolean;
  value?: unknown;
  expression?: string;
  keys?: AeKey[];
  children?: AeProp[];
}
export interface AeLayer {
  index: number;
  name: string;
  type: "text" | "shape" | "solid" | "null" | "precomp" | "footage" | "camera" | "light" | "other";
  inPoint: number;
  outPoint: number;
  startTime: number;
  enabled: boolean;
  parent: number | null;
  threeD?: boolean;
  blendingMode?: string;
  trackMatteType?: string;
  stretch?: number;
  timeRemapEnabled?: boolean;
  source?: string;
  solidColor?: number[];
  width?: number;
  height?: number;
  properties: AeProp[];
}
export interface AeComp {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  motionBlur?: boolean;
  shutterAngle?: number;
  layers: AeLayer[];
}
export interface AeDump {
  format: string;
  root: string;
  comps: AeComp[];
}

export interface AeImport {
  doc: SceneDoc;
  /** Network id of the asset (the AE comp). */
  asset: string;
  /** Promoted control ids, from layers marked `[ctl]`. */
  controls: string[];
  /** What was skipped or approximated, in plain words. */
  notes: string[];
}

const find = (props: AeProp[] | undefined, ...path: string[]): AeProp | undefined => {
  let list = props, hit: AeProp | undefined;
  for (const m of path) {
    hit = list?.find((p) => p.matchName === m);
    if (!hit) return undefined;
    list = hit.children;
  }
  return hit;
};

const num = (v: unknown, d = 0): number => (typeof v === "number" && isFinite(v) ? v : d);
const vec = (v: unknown): number[] => (Array.isArray(v) ? (v as unknown[]).map((x) => num(x)) : [num(v)]);
const dist = (a: number[], b: number[]) => Math.hypot(...a.map((x, i) => (b[i] ?? 0) - x));
const close = (a: number[], b: number[], eps = 0.02) => a.every((x, i) => Math.abs(x - (b[i] ?? 0)) <= eps);

const ROLES: [RegExp, Role][] = [
  [/\b(bg|background)\b/, "background"], [/\bsub-?title\b/, "subtitle"], [/\btitle|headline|name\b/, "title"], [/\bpanel|bar|plate|box\b/, "panel"],
  [/\baccent\b/, "accent"], [/\blogo\b/, "logo"], [/\bicon\b/, "icon"], [/\blabel\b/, "label"], [/\bbody\b/, "body"],
];
const roleOf = (name: string): Role | undefined => ROLES.find(([re]) => re.test(name.toLowerCase()))?.[1];

/* ---------- keyframes ---------- */

interface Track {
  value: number[];
  /** Keys in AE's own values, with the ease of the segment that starts at each. */
  keys?: { t: number; v: number[]; ease: string }[];
}

/**
 * A property as a track of number vectors. `spatial` properties (position, anchor) ease along
 * the path with one speed; others ease per dimension, and our keys hold one ease per key.
 */
function track(prop: AeProp | undefined, fallback: number[], spatial: boolean, where: string, notes: string[]): Track {
  if (!prop) return { value: fallback };
  if (prop.expression) notes.push(`${where}: has an expression, which isn't imported; its value at export time is used.`);
  const value = prop.value === undefined || prop.value === null ? fallback : vec(prop.value);
  const ks = prop.keys;
  if (!ks?.length) return { value };
  let curved = false, perDim = false, early = false;
  const keys = ks.map((k, i) => {
    const v = vec(k.v), next = ks[i + 1];
    if (k.t < 0) early = true;
    let ease = "linear";
    if (next) {
      const nv = vec(next.v), dt = next.t - k.t;
      if (k.outInterp === "hold") ease = "hold";
      else if (k.outInterp === "linear" && next.inInterp === "linear") ease = "linear";
      else if (spatial) {
        const dv = dist(v, nv);
        if ([k.spatialOut, next.spatialIn].some((s) => s?.some((x) => Math.abs(x) > 0.01))) curved = true;
        const out = k.outInterp === "linear" ? linearSide(dt, dv) : k.easeOut?.[0], inn = next.inInterp === "linear" ? linearSide(dt, dv) : next.easeIn?.[0];
        const b = out && inn && segmentBezier(dt, dv, out, inn);
        if (b) ease = bezierToEase(b);
      } else {
        // one curve per dimension that changes; our key takes the first and reports a mismatch
        const curves = v.map((x, d) => {
          const dv = (nv[d] ?? x) - x;
          const out = k.outInterp === "linear" ? linearSide(dt, dv) : k.easeOut?.[d] ?? k.easeOut?.[0], inn = next.inInterp === "linear" ? linearSide(dt, dv) : next.easeIn?.[d] ?? next.easeIn?.[0];
          return out && inn ? segmentBezier(dt, dv, out, inn) : undefined;
        }).filter((b) => !!b);
        if (curves[0]) ease = bezierToEase(curves[0]);
        if (curves.some((c) => !close(c, curves[0]!))) perDim = true;
      }
    }
    return { t: r4(Math.max(0, k.t)), v, ease };
  });
  if (curved) notes.push(`${where}: the motion path is curved in After Effects; it's imported as straight moves between keys.`);
  if (perDim) notes.push(`${where}: X and Y ease differently in After Effects; both use the first dimension's ease here.`);
  if (early) notes.push(`${where}: keys before the start of the comp were moved to 0 s.`);
  return { value, keys };
}

/** A track as a doc param, each value passed through `map` (which must be linear so eases stay true). */
function param(t: Track, map: (v: number[]) => Value): Param {
  const keys: Key[] | undefined = t.keys?.map((k) => ({ t: k.t, v: map(k.v), ease: k.ease }));
  return keys ? { value: map(t.keys![0]!.v), keys } : { value: map(t.value) };
}
const isDefault = (t: Track, d: number[]) => !t.keys && close(t.value, d, 1e-6);
const xy = (v: number[]): Value => [r4(v[0] ?? 0), r4(v[1] ?? 0)];
const first = (v: number[]): Value => r4(v[0] ?? 0);

/* ---------- layers ---------- */

type Params = Record<string, Param>;

interface Built {
  /** Nodes and wires this layer adds; `out` is the node to wire onwards. */
  nodes: Node[];
  wires: Wire[];
  out: string;
  promoted: Promoted[];
}

const wire = (from: string, to: string): Wire => ({ from: { node: from, port: "out" }, to: { node: to, port: "in" } });

/** "Inter-SemiBold" → Inter, 600. AE reports PostScript names, so this is a best guess and is noted. */
function fontOf(ps: string): { family: string; weight: number } {
  const [base = ps, style = ""] = ps.split("-");
  const weight = weightOf(style);
  return { family: base.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s*(Variable|VF)$/i, "").trim() || ps, weight };
}

/** AE path value → SVG path data in the shape's own space. */
function pathData(v: unknown): string {
  const s = (v ?? {}) as { vertices?: number[][]; inTangents?: number[][]; outTangents?: number[][]; closed?: boolean };
  const p = s.vertices ?? [];
  if (!p.length) return "";
  const f = (n: number) => String(r4(n));
  let d = `M${f(p[0]![0]!)} ${f(p[0]![1]!)}`;
  const seg = (a: number, b: number) => {
    const o = s.outTangents?.[a] ?? [0, 0], i = s.inTangents?.[b] ?? [0, 0];
    d += o[0] || o[1] || i[0] || i[1] ? ` C${f(p[a]![0]! + o[0]!)} ${f(p[a]![1]! + o[1]!)} ${f(p[b]![0]! + i[0]!)} ${f(p[b]![1]! + i[1]!)} ${f(p[b]![0]!)} ${f(p[b]![1]!)}` : ` L${f(p[b]![0]!)} ${f(p[b]![1]!)}`;
  };
  for (let i = 1; i < p.length; i++) seg(i - 1, i);
  if (s.closed) seg(p.length - 1, 0), (d += " Z");
  return d;
}

interface Xform {
  anchor: Track;
  position: Track;
  scale: Track;
  rotation: Track;
  opacity: Track;
}

/** Transform params, leaving out what sits at its default. `anchorAdd` shifts the anchor (see shapes). */
function transformParams(x: Partial<Xform>, anchorAdd?: { size: Track; offset: number[] }): Params {
  const p: Params = {};
  if (x.position && !isDefault(x.position, [0, 0])) p.position = param(x.position, xy);
  if (x.scale && !isDefault(x.scale, [100, 100])) p.scale = param(x.scale, xy);
  if (x.rotation && !isDefault(x.rotation, [0])) p.rotation = param(x.rotation, first);
  if (x.opacity && !isDefault(x.opacity, [100])) p.opacity = param(x.opacity, first);
  const a = x.anchor ?? { value: [0, 0] };
  if (anchorAdd) {
    // A shape draws from [0, 0] to its size; AE centres it on its own position. The anchor makes up
    // the difference, and follows a keyed size with the same eases so the centre stays put.
    const { size, offset } = anchorAdd, base = a.keys ? a.keys[0]!.v : a.value;
    const at = (s: number[]): Value => [r4((base[0] ?? 0) + (s[0] ?? 0) / 2 - (offset[0] ?? 0)), r4((base[1] ?? 0) + (s[1] ?? 0) / 2 - (offset[1] ?? 0))];
    p.anchor = size.keys ? { value: at(size.keys[0]!.v), keys: size.keys.map((k) => ({ t: k.t, v: at(k.v), ease: k.ease })) } : { value: at(size.value) };
  } else if (!isDefault(a, [0, 0])) p.anchor = param(a, xy);
  return p;
}

interface Ctx {
  comp: AeComp;
  uid: (wanted: string) => string;
  notes: string[];
  /** AE comp id → network id (precomps). */
  networkOf: (compId: string) => string | undefined;
}

function layerXform(l: AeLayer, where: string, notes: string[]): Xform {
  const T = (m: string) => find(l.properties, "ADBE Transform Group", m);
  let position = track(T("ADBE Position"), [0, 0], true, `${where} position`, notes);
  const px = T("ADBE Position_0"), py = T("ADBE Position_1");
  if (px?.keys?.length || py?.keys?.length) {
    // Separated dimensions: one track per axis in AE, one vector track here.
    const tx = track(px, [position.value[0] ?? 0], false, `${where} X position`, notes), ty = track(py, [position.value[1] ?? 0], false, `${where} Y position`, notes);
    const at = (t: Track, time: number) => {
      const ks = t.keys;
      if (!ks) return t.value[0] ?? 0;
      if (time <= ks[0]!.t) return ks[0]!.v[0]!;
      for (let i = 1; i < ks.length; i++) if (time <= ks[i]!.t) return ks[i - 1]!.v[0]! + ((ks[i]!.v[0]! - ks[i - 1]!.v[0]!) * (time - ks[i - 1]!.t)) / (ks[i]!.t - ks[i - 1]!.t);
      return ks[ks.length - 1]!.v[0]!;
    };
    const times = [...new Set([...(tx.keys ?? []), ...(ty.keys ?? [])].map((k) => k.t))].sort((a, b) => a - b);
    const same = tx.keys?.length === ty.keys?.length && (tx.keys ?? []).every((k, i) => k.t === ty.keys![i]!.t && k.ease === ty.keys![i]!.ease);
    if (!same && tx.keys && ty.keys) notes.push(`${where} position: X and Y are separate tracks in After Effects with different keys; they're merged into one track here, so the path between keys can differ.`);
    position = { value: [tx.value[0] ?? 0, ty.value[0] ?? 0], keys: times.map((t) => ({ t, v: [at(tx, t), at(ty, t)], ease: (tx.keys?.find((k) => k.t === t) ?? ty.keys?.find((k) => k.t === t))!.ease })) };
  }
  return {
    position,
    anchor: track(T("ADBE Anchor Point"), [0, 0], true, `${where} anchor`, notes),
    scale: track(T("ADBE Scale"), [100, 100], false, `${where} scale`, notes),
    rotation: track(T("ADBE Rotate Z"), [0], false, `${where} rotation`, notes),
    opacity: track(T("ADBE Opacity"), [100], false, `${where} opacity`, notes),
  };
}

/** What the importer can't carry over for this layer, as notes. */
function unsupported(l: AeLayer, where: string, notes: string[]) {
  const fx = find(l.properties, "ADBE Effect Parade")?.children?.map((c) => c.name) ?? [];
  if (fx.length) notes.push(`${where}: effects aren't imported (${fx.join(", ")}).`);
  if (find(l.properties, "ADBE Mask Parade")?.children?.length) notes.push(`${where}: masks aren't imported yet.`);
  if (l.blendingMode && l.blendingMode !== "normal") notes.push(`${where}: blending mode "${l.blendingMode}" isn't imported; it draws as normal.`);
  if (l.trackMatteType && l.trackMatteType !== "none") notes.push(`${where}: its track matte isn't imported.`);
  if (l.threeD) notes.push(`${where}: is a 3D layer; only its 2D position, scale and Z rotation are imported.`);
  if (l.timeRemapEnabled) notes.push(`${where}: time remapping isn't imported.`);
  if (l.stretch !== undefined && Math.abs(l.stretch - 100) > 0.01) notes.push(`${where}: time stretch (${l.stretch}%) isn't imported.`);
}

function textLayer(l: AeLayer, where: string, ctx: Ctx): { params: Params } {
  const docProp = find(l.properties, "ADBE Text Properties", "ADBE Text Document");
  const td = (docProp?.keys?.[0]?.v ?? docProp?.value ?? {}) as { text?: string; font?: string; fontSize?: number; tracking?: number; justification?: string; applyFill?: boolean; fillColor?: number[]; applyStroke?: boolean; strokeColor?: number[]; strokeWidth?: number; allCaps?: boolean; boxTextSize?: number[] };
  const size = num(td.fontSize, 64), font = fontOf(td.font ?? "Inter");
  const text = (s: unknown) => String(s ?? "").replace(/\r\n?|\u0003/g, "\n");
  const shown = (s: unknown) => (td.allCaps ? text(s).toUpperCase() : text(s));
  if (td.font) ctx.notes.push(`${where}: font "${td.font}" is imported as family "${font.family}", weight ${font.weight}. Check that the app has it.`);
  if (td.boxTextSize) ctx.notes.push(`${where}: is box text; it's imported as point text, so line breaks and position can differ.`);
  if (find(l.properties, "ADBE Text Properties", "ADBE Text Animators")?.children?.length) ctx.notes.push(`${where}: text animators aren't imported; rebuild them with Split and Phase.`);
  const params: Params = {
    text: docProp?.keys && docProp.keys.length > 1 ? { value: shown((docProp.keys[0]!.v as { text?: string }).text), keys: docProp.keys.map((k) => ({ t: r4(Math.max(0, k.t)), v: shown((k.v as { text?: string }).text), ease: "hold" })) } : { value: shown(td.text) },
    font: { value: font.family },
    weight: { value: font.weight },
    size: { value: r4(size) },
    fill: { value: td.applyFill === false ? "#00000000" : hex(td.fillColor ?? [1, 1, 1]) },
  };
  if (td.tracking) params.tracking = { value: r4((td.tracking / 1000) * size) };
  if (td.justification === "center" || td.justification === "right") params.align = { value: td.justification };
  if (td.applyStroke && td.strokeWidth) (params.stroke = { value: hex(td.strokeColor) }), (params.strokeWidth = { value: r4(td.strokeWidth) });
  return { params };
}

/** One vector group of a shape layer as Shape params, or undefined when it holds nothing we draw. */
function vectorGroup(items: AeProp[], where: string, notes: string[]): { params: Params; size: Track; offset: number[] } | undefined {
  const on = items.filter((i) => i.enabled !== false);
  const rect = on.find((i) => i.matchName === "ADBE Vector Shape - Rect"), ell = on.find((i) => i.matchName === "ADBE Vector Shape - Ellipse"), path = on.find((i) => i.matchName === "ADBE Vector Shape - Group");
  const geo = rect ?? ell ?? path;
  if (!geo) return undefined;
  const known = new Set(["ADBE Vector Shape - Rect", "ADBE Vector Shape - Ellipse", "ADBE Vector Shape - Group", "ADBE Vector Graphic - Fill", "ADBE Vector Graphic - Stroke", "ADBE Vector Filter - Trim", "ADBE Vector Group"]);
  const extra = on.filter((i) => !known.has(i.matchName) || (i !== geo && /Shape - /.test(i.matchName)));
  if (extra.length) notes.push(`${where}: not imported: ${[...new Set(extra.map((i) => i.name))].join(", ")}.`);
  const params: Params = {};
  let size: Track = { value: [0, 0] }, offset = [0, 0];
  if (geo === path) {
    const p = find([geo], "ADBE Vector Shape - Group", "ADBE Vector Shape");
    if (p?.keys?.length) notes.push(`${where}: the path is animated in After Effects; only its first shape is imported.`);
    params.shape = { value: "path" };
    params.path = { value: pathData(p?.keys?.[0]?.v ?? p?.value) };
  } else {
    const kind = geo === rect ? "Rect" : "Ellipse";
    size = track(find([geo], geo.matchName, `ADBE Vector ${kind} Size`), [100, 100], false, `${where} size`, notes);
    const pos = find([geo], geo.matchName, `ADBE Vector ${kind} Position`);
    if (pos?.keys?.length) notes.push(`${where}: the shape's own position is animated; its first value is used. Animate the layer instead.`);
    offset = vec(pos?.keys?.[0]?.v ?? pos?.value ?? [0, 0]);
    params.shape = { value: geo === rect ? "rect" : "ellipse" };
    params.size = param(size, xy);
    const round = geo === rect ? track(find([geo], geo.matchName, "ADBE Vector Rect Roundness"), [0], false, `${where} roundness`, notes) : undefined;
    if (round && !isDefault(round, [0])) params.radius = param(round, first);
  }
  const colour = (g: AeProp | undefined, c: string, o: string, what: string): Param | undefined => {
    if (!g) return undefined;
    const op = find([g], g.matchName, o), alpha = num(op?.value, 100) / 100;
    if (op?.keys?.length) notes.push(`${where}: ${what} opacity is animated; it's imported at its first value. Animate the layer's opacity instead.`);
    const t = track(find([g], g.matchName, c), [1, 1, 1, 1], false, `${where} ${what} colour`, notes);
    return param(t, (v) => hex(v, alpha));
  };
  const fill = on.find((i) => i.matchName === "ADBE Vector Graphic - Fill"), stroke = on.find((i) => i.matchName === "ADBE Vector Graphic - Stroke"), trim = on.find((i) => i.matchName === "ADBE Vector Filter - Trim");
  params.fill = colour(fill, "ADBE Vector Fill Color", "ADBE Vector Fill Opacity", "fill") ?? { value: "#00000000" };
  if (stroke) {
    params.stroke = colour(stroke, "ADBE Vector Stroke Color", "ADBE Vector Stroke Opacity", "stroke")!;
    params.strokeWidth = param(track(find([stroke], stroke.matchName, "ADBE Vector Stroke Width"), [1], false, `${where} stroke width`, notes), first);
  }
  if (trim) {
    const start = find([trim], trim.matchName, "ADBE Vector Trim Start");
    if (start?.keys?.length || num(start?.value) > 0.01) notes.push(`${where}: trim start isn't imported; only trim end is.`);
    const end = track(find([trim], trim.matchName, "ADBE Vector Trim End"), [100], false, `${where} trim end`, notes);
    if (!isDefault(end, [100])) params.trimEnd = param(end, first);
  }
  return { params, size, offset };
}

/**
 * A layer's own content: the node that draws it (with `x` as its transform), or a Group of shapes.
 * Returns undefined for layers that draw nothing we support.
 */
function content(l: AeLayer, name: string, x: Partial<Xform>, timing: Node["timing"], ctx: Ctx): Built | undefined {
  const where = `"${l.name}"`, id = ctx.uid(slug(name, "layer")), role = roleOf(name);
  const node = (nid: string, type: string, nname: string, params: Params, extra: Partial<Node> = {}): Node => ({ id: nid, type, name: nname, enabled: l.enabled, params, ui: { x: 0, y: 0 }, ...(role ? { role } : {}), ...(timing ? { timing } : {}), ...extra });
  const promote = (param: string, control: Promoted["control"]): Promoted[] => (/\[ctl\]/i.test(l.name) ? [{ id, label: name, target: { node: id, param }, control }] : []);
  if (l.type === "text") {
    const t = textLayer(l, where, ctx);
    return { nodes: [node(id, "Text", name, { ...t.params, ...transformParams(x) })], wires: [], out: id, promoted: promote("text", "text") };
  }
  if (l.type === "solid") {
    const params: Params = { shape: { value: "rect" }, size: { value: [num(l.width, ctx.comp.width), num(l.height, ctx.comp.height)] }, fill: { value: hex(l.solidColor ?? [0, 0, 0]) }, ...transformParams(x) };
    return { nodes: [node(id, "Shape", name, params)], wires: [], out: id, promoted: promote("fill", "color") };
  }
  if (l.type === "precomp") {
    const subnet = l.source && ctx.networkOf(l.source);
    if (!subnet) return undefined;
    // A precomp plays from its start time; a Subnet plays from its in point. Line them up.
    const start = Math.max(0, l.startTime);
    if (l.inPoint - l.startTime > 0.5 / ctx.comp.fps) ctx.notes.push(`${where}: the precomp is trimmed at its start in After Effects; here it shows from ${r4(start)} s (its first frame) instead of ${r4(l.inPoint)} s.`);
    return { nodes: [node(id, "Subnet", name, transformParams(x), { subnet, timing: { in: r4(start), out: r4(Math.min(ctx.comp.duration, Math.max(start + 1 / ctx.comp.fps, l.outPoint))) } })], wires: [], out: id, promoted: [] };
  }
  if (l.type === "shape") {
    const root = find(l.properties, "ADBE Root Vectors Group")?.children ?? [];
    // Each top-level group is one shape; loose items at the root count as one group.
    const groups: { name: string; items: AeProp[]; xf?: AeProp }[] = root.filter((g) => g.matchName === "ADBE Vector Group" && g.enabled !== false).map((g) => ({ name: g.name, items: find([g], "ADBE Vector Group", "ADBE Vectors Group")?.children ?? [], xf: find([g], "ADBE Vector Group", "ADBE Vector Transform Group") }));
    if (root.some((g) => /Shape - /.test(g.matchName))) groups.push({ name, items: root.filter((g) => g.matchName !== "ADBE Vector Group") });
    const shapes = groups.flatMap((g) => {
      const v = vectorGroup(g.items, `${where} › ${g.name}`, ctx.notes);
      if (!v) return [];
      const G = (m: string) => find(g.xf?.children, m), w = `${where} › ${g.name}`;
      const gx: Xform = {
        position: track(G("ADBE Vector Position"), [0, 0], true, `${w} position`, ctx.notes), anchor: track(G("ADBE Vector Anchor"), [0, 0], true, `${w} anchor`, ctx.notes),
        scale: track(G("ADBE Vector Scale"), [100, 100], false, `${w} scale`, ctx.notes), rotation: track(G("ADBE Vector Rotation"), [0], false, `${w} rotation`, ctx.notes), opacity: track(G("ADBE Vector Group Opacity"), [100], false, `${w} opacity`, ctx.notes),
      };
      const plain = isDefault(gx.position, [0, 0]) && isDefault(gx.anchor, [0, 0]) && isDefault(gx.scale, [100, 100]) && isDefault(gx.rotation, [0]) && isDefault(gx.opacity, [100]);
      return [{ ...v, name: g.name, gx, plain }];
    });
    if (!shapes.length) {
      ctx.notes.push(`${where}: has no rectangle, ellipse or path to import; skipped.`);
      return undefined;
    }
    const centred = (s: (typeof shapes)[number]) => (s.params.shape!.value === "path" ? undefined : { size: s.size, offset: s.offset });
    if (shapes.length === 1 && shapes[0]!.plain) {
      const s = shapes[0]!;
      if (x.anchor?.keys && centred(s)) ctx.notes.push(`${where}: the anchor point is animated; it's imported at its first value.`);
      return { nodes: [node(id, "Shape", name, { ...s.params, ...transformParams(x, centred(s)) })], wires: [], out: id, promoted: promote("fill", "color") };
    }
    // Several shapes, or a group with its own transform: a Group carries the layer, shapes sit inside.
    const kids = shapes.map((s) => ({ id: ctx.uid(slug(`${name}-${s.name}`, "shape")), s })).reverse(); // AE paints the last group first
    return {
      nodes: [...kids.map(({ id: kid, s }): Node => ({ id: kid, type: "Shape", name: s.name, enabled: true, params: { ...s.params, ...transformParams(s.gx, centred(s)) }, ui: { x: 0, y: 0 } })), node(id, "Group", name, transformParams(x))],
      wires: kids.map((k) => wire(k.id, id)),
      out: id,
      promoted: [],
    };
  }
  return undefined;
}

/** One AE comp as a network: layers back to front into a Merge. */
function network(comp: AeComp, id: string, name: string, notes: string[], networkOf: Ctx["networkOf"]): Network {
  const ctx: Ctx = { comp, uid: ids(), notes, networkOf };
  const merge = ctx.uid("merge");
  const byIndex = new Map(comp.layers.map((l) => [l.index, l]));
  const kidsOf = new Map<number, AeLayer[]>();
  for (const l of comp.layers) if (l.parent !== null && byIndex.has(l.parent)) kidsOf.set(l.parent, [...(kidsOf.get(l.parent) ?? []), l]);
  const nodes: Node[] = [], wires: Wire[] = [], promoted: Promoted[] = [];
  /** Control id → its layer's place in the AE stack: controls are listed top layer first, as designers see them. */
  const stack = new Map<string, number>();

  /** Builds a layer and everything parented to it; returns the node to wire onwards, if any. */
  const build = (l: AeLayer): string | undefined => {
    const where = `"${l.name}"`, name = l.name.replace(/\s*\[ctl\]\s*/gi, " ").trim() || `Layer ${l.index}`;
    if (l.type === "camera" || l.type === "light" || l.type === "footage" || l.type === "other") {
      notes.push(`${where}: ${l.type === "other" ? "this kind of layer" : `${l.type} layers`} aren't imported; skipped.`);
      if (!kidsOf.has(l.index)) return undefined;
    }
    unsupported(l, where, notes);
    const x = layerXform(l, where, notes), kids = (kidsOf.get(l.index) ?? []).slice().sort((a, b) => b.index - a.index);
    const whole = l.inPoint <= 0.5 / comp.fps && l.outPoint >= comp.duration - 0.5 / comp.fps;
    const timing = whole ? undefined : { in: r4(Math.min(comp.duration, Math.max(0, l.inPoint))), out: r4(Math.min(comp.duration, Math.max(l.inPoint + 1 / comp.fps, l.outPoint))) };
    const add = (b: Built | undefined) => {
      if (b) nodes.push(...b.nodes), wires.push(...b.wires), promoted.push(...b.promoted), b.promoted.forEach((c) => stack.set(c.id, l.index));
      return b?.out;
    };
    if (!kids.length) return l.type === "null" ? undefined : add(content(l, name, x, timing, ctx));
    // A parent: a Group carries its position, scale and rotation for itself and its children.
    // Opacity and in/out stay on the layer's own content, as in After Effects.
    const family = [l, ...kids].map((k) => k.index), lo = Math.min(...family), hi = Math.max(...family);
    if (comp.layers.some((o) => o.index > lo && o.index < hi && !family.includes(o.index) && o.type !== "null")) notes.push(`${where}: layers between it and its children in the stack are drawn above or below the whole group here, so the stacking order can differ.`);
    const own = l.type === "null" ? undefined : add(content(l, name, { opacity: x.opacity }, timing, ctx));
    const rig = ctx.uid(slug(`${name}-rig`, "rig"));
    nodes.push({ id: rig, type: "Group", name: `${name} (parent)`, enabled: true, params: transformParams({ position: x.position, anchor: x.anchor, scale: x.scale, rotation: x.rotation }), ui: { x: 0, y: 0 } });
    // back to front: children below the parent, the parent's own content, children above it
    const order = [...kids.filter((k) => k.index > l.index).map(build), own, ...kids.filter((k) => k.index < l.index).map(build)];
    for (const o of order) if (o) wires.push(wire(o, rig));
    return rig;
  };

  const tops = comp.layers.filter((l) => l.parent === null || !byIndex.has(l.parent)).sort((a, b) => b.index - a.index);
  for (const l of tops) {
    const out = build(l);
    if (out) wires.push(wire(out, merge));
  }
  nodes.push({ id: merge, type: "Merge", name: "Merge", enabled: true, params: {}, ui: { x: 0, y: 0 } });
  promoted.sort((a, b) => stack.get(a.id)! - stack.get(b.id)!);
  // lay the graph out in columns: sources left, what they feed to the right
  const depth = new Map<string, number>();
  const depthOf = (n: string): number => depth.get(n) ?? (depth.set(n, 0), depth.set(n, Math.max(0, ...wires.filter((w) => w.to.node === n).map((w) => depthOf(w.from.node) + 1))), depth.get(n)!);
  const rows = new Map<number, number>();
  for (const n of nodes) {
    const d = depthOf(n.id), row = rows.get(d) ?? 0;
    rows.set(d, row + 1);
    n.ui = { x: d * 240, y: row * 120 };
  }
  return { id, name, nodes, wires, output: merge, ...(promoted.length ? { promoted } : {}) };
}

/** Converts a dump. Throws when the dump isn't one, or when the result isn't a valid doc (an importer bug). */
export function importAe(dump: AeDump): AeImport {
  if (!dump || typeof dump.format !== "string" || !dump.format.startsWith("mb-ae-dump/") || !Array.isArray(dump.comps)) throw new Error("This isn't an After Effects dump from tools/ae/mb-export.jsx (no mb-ae-dump format).");
  const root = dump.comps.find((c) => c.id === dump.root);
  if (!root) throw new Error(`The dump's root comp "${dump.root}" isn't in it.`);
  const notes: string[] = [];
  const uid = ids();
  uid("main");
  const assetId = uid(slug(root.name, "asset"));
  const netIds = new Map<string, string>([[root.id, assetId]]);
  for (const c of dump.comps) if (c !== root) netIds.set(c.id, uid(slug(c.name, "precomp")));
  const networks = dump.comps.map((c) => network(c, netIds.get(c.id)!, c.name, notes, (id) => netIds.get(id)));
  const asset = networks.find((n) => n.id === assetId)!;
  const fps = Math.round(root.fps * 1000) / 1000;
  const main: Network = {
    id: "main",
    name: `${root.name}_v01`,
    comp: { width: root.width, height: root.height, fps, duration: r4(root.duration), ...(root.motionBlur ? { motionBlur: { shutter: Math.min(720, Math.max(0, num(root.shutterAngle, 180))), samples: 8 } } : {}) },
    nodes: [
      { id: "asset", type: "Subnet", name: root.name, subnet: assetId, enabled: true, params: {}, ui: { x: 0, y: 0 } },
      { id: "out", type: "Output", name: "Output", enabled: true, params: {}, ui: { x: 240, y: 0 } },
    ],
    wires: [wire("asset", "out")],
    output: "out",
  };
  const r = validateDoc({ version: 3, name: root.name, root: "main", networks: [main, ...networks.filter((n) => n !== asset), asset].sort((a, b) => (a.id === "main" ? -1 : b.id === "main" ? 1 : 0)), assets: [], batches: [], source: { kind: "blank" } });
  if (!r.ok) throw new Error(`The imported doc isn't valid (an importer bug):\n${r.errors.join("\n")}`);
  return { doc: r.doc, asset: assetId, controls: (asset.promoted ?? []).map((p) => p.id), notes: [...new Set(notes)] };
}
