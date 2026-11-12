/** Typed access to v1's AE keyframe baker (`anime-ae-bake.es3.js`, unchanged), loaded as text. */
import source from "./anime-ae-bake.es3.js?raw";

/** [t, value, inSpeed, inInfluence%, outSpeed, outInfluence%, hold?] */
export type BakedKey = [number, number, number, number, number, number, 1?];
export type Baked = { value: number } | { keys: BakedKey[] };

export interface BakeModule {
  channel(fn: (t: number) => number, opts: { t0: number; t1: number; fps: number; tol: number; breaks?: number[]; maxKeys?: number }): Baked;
  valueAt(keys: BakedKey[], t: number): number;
  maxError(fn: (t: number) => number, res: Baked, t0: number, t1: number, fps: number): number;
  TOL: { x: number; y: number; scale: number; rot: number; op: number; blur: number; draw: number; amount: number };
}

let mod: BakeModule | undefined;
// eslint-disable-next-line @typescript-eslint/no-implied-eval -- deliberate: run the verbatim ES3 file
export const bake = (): BakeModule => (mod ??= new Function(`${source}; return AnimeAEBake;`)() as BakeModule);
