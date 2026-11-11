/**
 * Stagger delays, as Motion Builder v1's rig computes them (`AnimeAERig.delays`).
 * Works in ms like anime-ae; callers convert from the doc's seconds at the edge.
 */
import { stagger, type StaggerOptions } from "../motion/stagger";

export const STAGGER_FROM = ["first", "last", "center", "random", "edges"] as const;
export type StaggerFromName = (typeof STAGGER_FROM)[number];

export const isStaggerFrom = (v: unknown): v is StaggerFromName =>
  typeof v === "string" && (STAGGER_FROM as readonly string[]).includes(v);

/**
 * Delay in ms for each of `n` parts, `eachMs` apart.
 * "edges" is v1's own mode (outer parts first); the others are anime-ae `stagger`.
 * "random" uses the deterministic Park-Miller shuffle; seed 1 is what v1 uses.
 */
export function staggerDelaysMs(
  eachMs: number,
  from: StaggerFromName,
  n: number,
  extra: Pick<StaggerOptions, "seed" | "ease" | "grid"> = {},
): number[] {
  const out: number[] = [];
  const v = +eachMs || 0;
  if (from === "edges") {
    for (let i = 0; i < n; i++) out.push(v * Math.min(i, n - 1 - i));
    return out;
  }
  const st = stagger(v, { from, seed: extra.seed ?? 1, ease: extra.ease, grid: extra.grid });
  for (let i = 0; i < n; i++) out.push(n > 1 ? st(i, n) : 0);
  return out;
}
