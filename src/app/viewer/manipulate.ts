/**
 * Moving and turning things in the viewer: pure maths shared by the gizmo and body drags.
 * Values are read with keys applied (modifiers not) and written through the inspector's
 * `setValue`, so a keyed param gets a key at the playhead (AE rules) and a drag is one undo step.
 */
import { evaluateParam, type SceneDoc, type Value } from "@core/scene";

/** A param's vector value at time t (keys applied), padded to `len` components. */
export function vecAt(doc: SceneDoc, net: string, node: string, param: string, t: number, len: number, fallback = 0): number[] {
  const p = doc.networks.find((n) => n.id === net)?.nodes.find((n) => n.id === node)?.params[param];
  const v: Value | undefined = p ? (p.keys?.length ? evaluateParam({ value: p.value, keys: p.keys }, t) : p.value) : undefined;
  const a: number[] = Array.isArray(v) ? (v as number[]) : typeof v === "number" ? [v] : [];
  return Array.from({ length: len }, (_, i) => a[i] ?? fallback);
}

/**
 * How far along an axis a screen drag (dx, dy) goes, in world units: the drag projected onto the
 * axis as it appears on screen (`axis` = screen px covered by `unit` world units). An axis that
 * points at the camera (shorter than 4 px on screen) doesn't move.
 */
export function along(dx: number, dy: number, axis: readonly [number, number], unit: number): number {
  const len2 = axis[0] * axis[0] + axis[1] * axis[1];
  if (len2 < 16) return 0;
  return ((dx * axis[0] + dy * axis[1]) / len2) * unit;
}

/**
 * Degrees to turn around an axis for a screen drag: dragging across the axis (perpendicular to
 * how it appears on screen) turns it, 0.4° per px. An axis pointing at the camera turns with
 * horizontal drags.
 */
export function turnAround(dx: number, dy: number, axis: readonly [number, number]): number {
  const len = Math.hypot(axis[0], axis[1]);
  const [px, py] = len < 4 ? [1, 0] : [-axis[1] / len, axis[0] / len];
  return Math.round((dx * px + dy * py) * 0.4 * 100) / 100;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** `start` with `amount` added to component `i`, rounded to 0.01. */
export const nudged = (start: readonly number[], i: number, amount: number) => start.map((v, j) => r2(j === i ? v + amount : v));

/** `start` plus a delta vector, rounded to 0.01. */
export const plus = (start: readonly number[], d: readonly number[]) => start.map((v, j) => r2(v + (d[j] ?? 0)));
