/**
 * Phase gate: a Phase "in" node followed by a Phase "out" node must give exactly what
 * Motion Builder v1's rig (`AnimeAERig.compute`, ES3) gives, for every ease, stagger origin and time.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MENU_EASES } from "@core/motion";
import { applyPhase, phaseDelays, phaseProgress, REST, STAGGER_FROM, type PartAnim, type PhaseSpec } from "@core/scene";

const read = (f: string) => readFileSync(fileURLToPath(new URL(`../fixtures/${f}`, import.meta.url)), "utf8");
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const ES3 = new Function(`${read("anime-ae-core.es3.js")}; return AnimeAE;`)();
type V1Phase = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const RIG = new Function(`${read("anime-ae-rig.es3.js")}; return AnimeAERig;`)() as {
  bind(core: unknown): void;
  normalize(p: object): { in: V1Phase; out: V1Phase };
  easeString(ph: V1Phase): string;
  delays(ph: V1Phase, n: number): number[];
  compute(p: object, idx: number, n: number, t: number, inPt: number, outPt: number): PartAnim & { draw: number };
};
RIG.bind(ES3);

const spec = (mode: "in" | "out", ph: V1Phase): PhaseSpec => ({
  mode,
  startMs: 0,
  durationMs: ph.duration as number,
  ease: RIG.easeString(ph),
  staggerMs: ph.stagger as number,
  from: ph.from as PhaseSpec["from"],
  x: ph.x as number,
  y: ph.y as number,
  scale: ph.scale as number,
  rotation: ph.rotate as number,
  opacity: ph.opacity as number,
  blur: ph.blur as number,
  reveal: "none",
});

/** The node chain: Phase in -> Phase out, as evaluate.ts runs it. */
function chain(p: { in: V1Phase; out: V1Phase }, idx: number, n: number, t: number, inPt: number, outPt: number): PartAnim {
  let a = REST;
  for (const mode of ["in", "out"] as const) {
    if (!p[mode].on) continue;
    const s = spec(mode, p[mode]);
    a = applyPhase(a, s, phaseProgress(s, phaseDelays(s, n), idx, t, inPt, outPt));
  }
  return a;
}

const IN_PT = 200, OUT_PT = 4200;
const TIMES = Array.from({ length: 45 }, (_, i) => i * 100);

const CASES = MENU_EASES.flatMap((ease, i) => {
  const from = STAGGER_FROM[i % STAGGER_FROM.length]!;
  const outFrom = STAGGER_FROM[(i + 2) % STAGGER_FROM.length]!;
  return [
    {
      name: `${ease} from ${from}, in + out`,
      p: {
        in: { on: true, duration: 300 + i * 37, ease, amount: (i * 13) % 101, bx1: 0.3, by1: 0.1, bx2: 0.2, by2: 1, stagger: 45 + i, from, x: -60 + i, y: 40, scale: 30 + i * 5, rotate: -25, opacity: i % 3 ? 0 : 40, blur: 12 },
        out: { on: true, duration: 250 + i * 11, ease: MENU_EASES[(i + 5) % MENU_EASES.length]!, amount: 50, stagger: 30, from: outFrom, x: 80, y: -20, scale: 140, rotate: 10, opacity: 0, blur: 6 },
      },
    },
    {
      name: `${ease} from ${from}, in only, zero duration`,
      p: { in: { on: true, duration: i % 4 ? 500 : 0, ease, stagger: 80, from, y: 30, opacity: 0 }, out: { on: false } },
    },
  ];
});

describe("Phase matches Motion Builder v1's rig", () => {
  it.each(STAGGER_FROM.flatMap((from) => [1, 2, 5, 8].map((n) => [from, n] as const)))("delays from %s, %i parts", (from, n) => {
    const ph = { stagger: 70, from };
    expect(phaseDelays(spec("in", RIG.normalize({ in: ph }).in), n)).toEqual(RIG.delays(RIG.normalize({ in: ph }).in, n));
  });

  it.each(CASES)("$name", ({ p }) => {
    const rig = RIG.normalize(p);
    for (const n of [1, 4, 7])
      for (let idx = 0; idx < n; idx++)
        for (const t of TIMES) {
          const want = RIG.compute(rig, idx, n, t, IN_PT, OUT_PT);
          const got = chain(rig, idx, n, t, IN_PT, OUT_PT);
          for (const k of ["dx", "dy", "sx", "sy", "rot", "op", "blur"] as const) expect(got[k]).toBe(want[k]);
        }
  });
});
