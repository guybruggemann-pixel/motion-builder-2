import { ease, num, type EaseRef } from "./eases";

export type StaggerFrom = "first" | "center" | "last" | "random" | number | [number, number];

export interface StaggerOptions {
  /** Offset added to every value (ms). Defaults to the range start when `val` is a range. */
  start?: number;
  from?: StaggerFrom;
  reversed?: boolean;
  /** Ease applied to the distance distribution, e.g. "inQuad". */
  ease?: EaseRef;
  /** [cols, rows] for 2D grids. */
  grid?: [number, number];
  axis?: "x" | "y";
  /** Seed for the deterministic shuffle used by from: "random". */
  seed?: number;
}

/**
 * anime.js stagger (index + grid modes), identical to the ES3 core.
 * `val` is ms per step, or a [from, to] range spread over the whole set.
 * Returns (index, total) => ms.
 */
export function stagger(val: number | [number, number], o: StaggerOptions = {}) {
  const isRange = Array.isArray(val);
  const v1 = isRange ? +val[0] : +val;
  const v2 = isRange ? +val[1] : 0;
  const start = o.start ? +o.start : isRange ? v1 : 0;
  const from: StaggerFrom = o.from === undefined ? "first" : o.from;
  const grid = o.grid;
  const axis = o.axis;
  const sEase = o.ease ? ease(o.ease) : null;

  return (i: number, total: number): number => {
    const fromIndex =
      from === "center" ? (total - 1) / 2 : from === "last" ? total - 1 : typeof from === "number" ? from : 0;
    const values: number[] = [];
    for (let k = 0; k < total; k++) {
      if (!grid) {
        values.push(Math.abs(fromIndex - k));
        continue;
      }
      let fx: number, fy: number;
      if (Array.isArray(from)) {
        fx = from[0] * (grid[0] - 1);
        fy = from[1] * (grid[1] - 1);
      } else if (from === "center") {
        fx = (grid[0] - 1) / 2;
        fy = (grid[1] - 1) / 2;
      } else {
        fx = fromIndex % grid[0];
        fy = Math.floor(fromIndex / grid[0]) % grid[1];
      }
      const dx = fx - (k % grid[0]);
      const dy = fy - (Math.floor(k / grid[0]) % grid[1]);
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (axis === "x") dist = -dx;
      if (axis === "y") dist = -dy;
      values.push(dist);
    }
    let maxV = values[0] ?? 0;
    for (let k = 1; k < total; k++) if (values[k]! > maxV) maxV = values[k]!;
    for (let k = 0; k < total; k++) {
      let x = values[k]!;
      if (sEase && maxV) x = sEase(x / maxV) * maxV;
      if (o.reversed) x = axis ? -x : Math.abs(maxV - x);
      values[k] = x;
    }
    if (from === "random") {
      // Park-Miller shuffle: deterministic so preview, render and AE agree.
      let seed = num(o.seed, 1);
      for (let k = values.length - 1; k > 0; k--) {
        seed = (seed * 16807) % 2147483647;
        const j = seed % (k + 1);
        const tmp = values[k]!;
        values[k] = values[j]!;
        values[j] = tmp;
      }
    }
    const spacing = isRange ? (v2 - v1) / (maxV || 1) : v1;
    return start + spacing * (Math.round(values[i]! * 100) / 100);
  };
}

/** Timeline position parser: 500, '+=200', '-=200', '<', '<<', '<<+=100'. */
export function position(
  pos: number | string | null | undefined,
  prevStart: number,
  prevEnd: number,
  tlEnd: number,
): number {
  if (pos === undefined || pos === null) return tlEnd;
  if (typeof pos === "number") return pos;
  const s = String(pos);
  let base = tlEnd;
  let rest = s;
  if (s.indexOf("<<") === 0) {
    base = prevStart;
    rest = s.slice(2);
  } else if (s.indexOf("<") === 0) {
    base = prevEnd;
    rest = s.slice(1);
  }
  if (rest.indexOf("+=") === 0) return base + +rest.slice(2);
  if (rest.indexOf("-=") === 0) return base - +rest.slice(2);
  if (rest === "") return base;
  return +rest;
}
