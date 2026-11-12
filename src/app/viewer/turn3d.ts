/**
 * Drag-to-turn for 3D objects in the viewer (Cinema 4D's rotate, without a gizmo yet):
 * left/right turns around Y, up/down around X. Works on an object inside a 3D scene and, from the
 * comp, on a 3D scene layer (it turns the scene's first object). Pure helpers; the viewer applies
 * them with the inspector's `setValue`, so keyed rotations get a key at the playhead (AE rules).
 */
import { evaluateParam, type Network, type Node, type SceneDoc, type Value } from "@core/scene";

/** Degrees per screen px of drag. */
export const TURN_DEG_PER_PX = 0.4;

export interface TurnTarget {
  /** Network and node whose `rotation` turns. */
  net: string;
  node: string;
  name: string;
  /** The node's local time (seconds) at the playhead. */
  t: number;
}

const turnable = (n: Node) => n.type === "Text3D" || n.type === "Shape3D" || n.type === "Cloner";

/** What a drag on `node` (selected in the shown network `net`, at local time `t`) turns, if anything. */
export function turnTarget(doc: SceneDoc, net: Network, node: Node, t: number): TurnTarget | undefined {
  if (turnable(node)) return { net: net.id, node: node.id, name: node.name, t };
  if (node.type !== "Scene3D" || !node.subnet) return undefined;
  const inner = doc.networks.find((n) => n.id === node.subnet);
  const obj = inner?.nodes.find((n) => turnable(n) && n.enabled);
  return inner && obj ? { net: inner.id, node: obj.id, name: obj.name, t: t - (node.timing?.in ?? 0) } : undefined;
}

/** The rotation the target has now (keys applied, modifiers not). */
export function rotationAt(doc: SceneDoc, target: TurnTarget): [number, number, number] {
  const p = doc.networks.find((n) => n.id === target.net)?.nodes.find((n) => n.id === target.node)?.params.rotation;
  const v: Value = p ? (p.keys?.length ? evaluateParam({ value: p.value, keys: p.keys }, target.t) : p.value) : [0, 0, 0];
  return Array.isArray(v) && v.length >= 3 ? [v[0]!, v[1]!, (v as number[])[2]!] : [0, 0, 0];
}

/**
 * The rotation after dragging (dx, dy) screen px from `start`. Dragging right turns the front to
 * the right (+Y), dragging down tips the top towards the viewer (+X). Shift keeps the larger axis.
 */
export function turned(start: [number, number, number], dx: number, dy: number, lockAxis = false): [number, number, number] {
  let [x, y] = [dx, dy];
  if (lockAxis) Math.abs(x) >= Math.abs(y) ? (y = 0) : (x = 0);
  const r = (v: number) => Math.round(v * 100) / 100;
  return [r(start[0] + y * TURN_DEG_PER_PX), r(start[1] + x * TURN_DEG_PER_PX), start[2]];
}
