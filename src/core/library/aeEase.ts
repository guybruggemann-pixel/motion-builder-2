/**
 * After Effects temporal eases (speed + influence per key side) to anime-ae ease strings.
 * The formula is in `docs/asset-library.md`; it is exact for one-dimensional and spatial
 * properties, because an AE segment between two bezier keys is a cubic bezier in (time, value).
 */
import { BEZIER_OF } from "../motion";

export interface AeEase {
  /** Units per second (px/s along the path for spatial properties). */
  speed: number;
  /** 0.1 to 100, percent of the segment. */
  influence: number;
}

export type Bezier = [number, number, number, number];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * The cubic-bezier of the segment from key A to key B: `dt` seconds long, the value changing by
 * `dv` (distance along the path for spatial properties). Undefined when nothing changes.
 */
export function segmentBezier(dt: number, dv: number, out: AeEase, inn: AeEase): Bezier | undefined {
  if (!(dt > 0) || dv === 0) return undefined;
  const s = dv / dt;
  const x1 = clamp01(out.influence / 100), x2 = clamp01(1 - inn.influence / 100);
  return [x1, (x1 * out.speed) / s, x2, 1 - ((inn.influence / 100) * inn.speed) / s];
}

/** What AE uses on a linear side of a key: a straight handle of one sixth of the segment. */
export const linearSide = (dt: number, dv: number): AeEase => ({ speed: dv / dt, influence: 100 / 6 });

const r3 = (x: number) => Math.round(x * 1000) / 1000 || 0;

/**
 * A menu ease when the curve is within `tolerance` of one (largest difference of the four
 * numbers), so designers see names they know; otherwise the exact `cubicBezier(…)`.
 */
export function bezierToEase(b: Bezier, tolerance = 0.04): string {
  let best: string | undefined, bestD = tolerance;
  for (const [name, m] of Object.entries(BEZIER_OF)) {
    const d = Math.max(Math.abs(b[0] - m[0]), Math.abs(b[1] - m[1]), Math.abs(b[2] - m[2]), Math.abs(b[3] - m[3]));
    if (d <= bestD) (best = name), (bestD = d);
  }
  return best ?? `cubicBezier(${b.map(r3).join(",")})`;
}
