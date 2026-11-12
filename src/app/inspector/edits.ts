/**
 * Inspector edits as immer recipes on the doc draft (tested in Node, no React).
 *
 * AE semantics for values: on a param with keys, changing the value at the playhead sets (or adds)
 * the key there; without keys it changes the base value. `tol` is half a frame in seconds, so a
 * key "at the playhead" means within the current frame.
 */
import type { Draft } from "immer";
import { CATALOG, isNodeType, type Key, type Modifier, type Network, type Node, type Param, type Role, type SceneDoc, type Value } from "@core/scene";

const netOf = (d: Draft<SceneDoc>, id: string): Draft<Network> => {
  const net = d.networks.find((n) => n.id === id);
  if (!net) throw new Error(`network ${id} not found`);
  return net;
};
const nodeOf = (d: Draft<SceneDoc>, netId: string, id: string): Draft<Node> => {
  const node = netOf(d, netId).nodes.find((n) => n.id === id);
  if (!node) throw new Error(`node ${netId}/${id} not found`);
  return node;
};

/** The param stack, created from the catalog default if the node doesn't carry it yet. */
function paramOf(node: Draft<Node>, name: string, fallback?: Value): Draft<Param> {
  const existing = node.params[name];
  if (existing) return existing;
  const def = isNodeType(node.type) ? (CATALOG[node.type].params as Record<string, { default: Value }>)[name]?.default : undefined;
  const value = fallback ?? def;
  if (value === undefined) throw new Error(`${node.id} has no param ${name}`);
  return (node.params[name] = { value: structuredClone(value) as Value });
}

export const keyAt = (keys: readonly Key[] | undefined, t: number, tol: number) => keys?.find((k) => Math.abs(k.t - t) <= tol);

/** Ease for a new key: the one already shaping that stretch (the key before), else linear. */
function insertKey(keys: Draft<Key>[], t: number, v: Value) {
  const before = [...keys].filter((k) => k.t < t).at(-1);
  keys.push({ t, v: structuredClone(v) as Value, ease: before?.ease ?? "linear" });
  keys.sort((a, b) => a.t - b.t);
}

/** Set a param's value at the playhead (key if animated, base value if not). */
export function setValue(d: Draft<SceneDoc>, netId: string, nodeId: string, name: string, v: Value, t: number, tol: number) {
  const p = paramOf(nodeOf(d, netId, nodeId), name, v);
  if (p.keys?.length) {
    const k = keyAt(p.keys, t, tol);
    if (k) k.v = structuredClone(v) as Value;
    else insertKey(p.keys, t, v);
  } else p.value = structuredClone(v) as Value;
}

/** The diamond: add a key at the playhead holding `current`, or remove the key that's there. */
export function toggleKey(d: Draft<SceneDoc>, netId: string, nodeId: string, name: string, t: number, tol: number, current: Value) {
  const p = paramOf(nodeOf(d, netId, nodeId), name, current);
  const k = keyAt(p.keys, t, tol);
  if (k) {
    p.keys!.splice(p.keys!.indexOf(k), 1);
    if (!p.keys!.length) {
      p.value = k.v;
      delete p.keys;
    }
    return;
  }
  p.keys ??= [];
  insertKey(p.keys, Math.max(0, t), current);
}

/** Ease of the segment that starts at the key at the playhead. */
export function setKeyEase(d: Draft<SceneDoc>, netId: string, nodeId: string, name: string, t: number, tol: number, ease: string) {
  const k = keyAt(nodeOf(d, netId, nodeId).params[name]?.keys, t, tol);
  if (k) k.ease = ease;
}

export type ModifierKind = "wave" | "noise" | "stagger" | "link";

export const MODIFIER_DEFAULTS: Record<ModifierKind, Modifier["params"]> = {
  wave: { amplitude: 10, frequency: 1, phase: 0, shape: "sine" },
  noise: { amplitude: 10, frequency: 1, seed: 1 },
  stagger: { each: 0.05, from: "first", seed: 1 },
  link: { scale: 1, offset: 0 }, // node and param are filled in by addModifier (the node itself, its bounds)
};

export function addModifier(d: Draft<SceneDoc>, netId: string, nodeId: string, name: string, type: ModifierKind): string {
  const p = paramOf(nodeOf(d, netId, nodeId), name);
  p.modifiers ??= [];
  let i = 1;
  while (p.modifiers.some((m) => m.id === `${type}-${i}`)) i++;
  const id = `${type}-${i}`;
  const params = { ...MODIFIER_DEFAULTS[type] };
  if (type === "link") Object.assign(params, { node: nodeId, param: "bounds" });
  p.modifiers.push({ id, type, enabled: true, blend: type === "link" ? "replace" : "add", params });
  return id;
}

export function updateModifier(
  d: Draft<SceneDoc>,
  netId: string,
  nodeId: string,
  name: string,
  id: string,
  patch: { enabled?: boolean; blend?: Modifier["blend"]; params?: Record<string, Value | undefined> },
) {
  const m = nodeOf(d, netId, nodeId).params[name]?.modifiers?.find((x) => x.id === id);
  if (!m) return;
  if (patch.enabled !== undefined) m.enabled = patch.enabled;
  if (patch.blend) m.blend = patch.blend;
  for (const [k, v] of Object.entries(patch.params ?? {}))
    if (v === undefined) delete m.params[k];
    else m.params[k] = v;
}

export function removeModifier(d: Draft<SceneDoc>, netId: string, nodeId: string, name: string, id: string) {
  const p = nodeOf(d, netId, nodeId).params[name];
  if (!p?.modifiers) return;
  p.modifiers = p.modifiers.filter((m) => m.id !== id);
  if (!p.modifiers.length) delete p.modifiers;
}

export function setNodeProps(
  d: Draft<SceneDoc>,
  netId: string,
  nodeId: string,
  patch: { name?: string; enabled?: boolean; role?: Role | null; timing?: { in: number; out: number } | null },
) {
  const n = nodeOf(d, netId, nodeId);
  if (patch.name !== undefined) n.name = patch.name;
  if (patch.enabled !== undefined) n.enabled = patch.enabled;
  if (patch.role === null) delete n.role;
  else if (patch.role) n.role = patch.role;
  if (patch.timing === null) delete n.timing;
  else if (patch.timing) n.timing = { ...patch.timing };
}

/** Drop a designer's value for a promoted control, so the subnet's own value shows again. */
export function resetParam(d: Draft<SceneDoc>, netId: string, nodeId: string, name: string) {
  delete nodeOf(d, netId, nodeId).params[name];
}

export function setComp(
  d: Draft<SceneDoc>,
  netId: string,
  patch: Partial<{ width: number; height: number; fps: number; duration: number; background: string | null; motionBlur: { shutter: number; samples: number } | null }>,
) {
  const comp = netOf(d, netId).comp;
  if (!comp) return;
  for (const k of ["width", "height", "fps", "duration"] as const) if (patch[k] !== undefined) comp[k] = patch[k]!;
  if (patch.background === null) delete comp.background;
  else if (patch.background !== undefined) comp.background = patch.background;
  if (patch.motionBlur === null) delete comp.motionBlur;
  else if (patch.motionBlur) comp.motionBlur = { ...patch.motionBlur };
}

/** What a designer gets to change on a layer when it's made editable: its content and its colour. */
export const DESIGNER_PARAMS: Record<string, { param: string; control: "text" | "color"; label: (name: string) => string }[]> = {
  Text: [{ param: "text", control: "text", label: (n) => n }],
  Shape: [{ param: "fill", control: "color", label: (n) => `${n} colour` }],
};

/** Promoted ids for a layer's designer controls: `<node>-<param>`, kept a valid slug. */
export const promotedId = (nodeId: string, param: string) => `${nodeId}-${param}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 64);

/** Whether any of this layer's params is promoted on its network (the asset). */
export const isDesignerEditable = (net: Network, nodeId: string) => (net.promoted ?? []).some((p) => p.target.node === nodeId);

/**
 * "Designers can edit": promote (or stop promoting) this layer's content controls on the asset
 * network, so designers see them as controls on every instance. Off removes every control that
 * targets the layer; instance values set for them are left on the instances (reset clears them).
 */
export function setDesignerEditable(d: Draft<SceneDoc>, netId: string, nodeId: string, on: boolean) {
  const net = netOf(d, netId);
  const node = nodeOf(d, netId, nodeId);
  net.promoted ??= [];
  if (!on) {
    net.promoted = net.promoted.filter((p) => p.target.node !== nodeId);
    return;
  }
  for (const c of DESIGNER_PARAMS[node.type] ?? []) {
    if (net.promoted.some((p) => p.target.node === nodeId && p.target.param === c.param)) continue;
    net.promoted.push({ id: promotedId(nodeId, c.param), label: c.label(node.name), target: { node: nodeId, param: c.param }, control: c.control });
  }
}
