/**
 * Phase 0 gate: the TypeScript core must match Motion Builder v1's ES3 core exactly,
 * because the ES3 file is still what runs inside After Effects.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EASE_NAMES, ease, spring, stagger, position, MENU_EASES, easeString } from "@core/motion";

const src = readFileSync(fileURLToPath(new URL("../fixtures/anime-ae-core.es3.js", import.meta.url)), "utf8");
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const ES3 = new Function(`${src}; return AnimeAE;`)() as {
  ease: (n: string) => (t: number) => number;
  spring: (o: object) => ((t: number) => number) & { settlingDuration: number };
  stagger: (v: number | number[], o?: object) => (i: number, n: number) => number;
  position: (p: unknown, a: number, b: number, c: number) => number;
  names: string[];
};

const T = Array.from({ length: 201 }, (_, i) => i / 200);
const same = (a: (t: number) => number, b: (t: number) => number) => {
  for (const t of T) expect(a(t)).toBe(b(t));
};

describe("eases match the ES3 core", () => {
  it("exposes the same 40 names", () => expect(EASE_NAMES).toEqual(ES3.names));

  it.each(EASE_NAMES)("%s", (n) => same(ease(n), ES3.ease(n)));

  it.each([
    "outBack(2.5)", "inOutBack(0.4)", "outElastic(1,0.2)", "inElastic(3,0.5)", "in(2.2)", "out(3)",
    "cubicBezier(0.2,0,0,1)", "cubicBezier(.85,0,.15,1)", "steps(5)", "steps(4,true)",
    "spring(0.4,628)", "spring(-0.3,900)", "linear", "hold", "nonsense",
  ])("%s", (n) => same(ease(n), ES3.ease(n)));

  it.each(MENU_EASES.flatMap((e) => [0, 40, 100].map((amount) => [e, amount] as const)))(
    "menu %s amount %i",
    (e, amount) => {
      const s = easeString({ ease: e, amount, bezier: [0.3, 0.1, 0.2, 1] });
      same(ease(s), ES3.ease(s));
    },
  );
});

describe("spring", () => {
  it.each([{ bounce: 0.5, duration: 628 }, { bounce: 0, duration: 400 }, { bounce: -0.5, duration: 1000 }, { stiffness: 200, damping: 12 }])(
    "%o",
    (o) => {
      const a = spring(o), b = ES3.spring(o);
      expect(a.settlingDuration).toBe(b.settlingDuration);
      same(a, b);
    },
  );
});

describe("stagger", () => {
  const cases: [number | [number, number], object, number][] = [
    [50, {}, 8],
    [50, { from: "center" }, 9],
    [50, { from: "last", reversed: true }, 6],
    [[0, 600], { from: "center", ease: "inQuad" }, 11],
    [40, { from: "random", seed: 7 }, 12],
    [30, { grid: [4, 3], from: "center" }, 12],
    [30, { grid: [5, 4], from: [0.2, 0.8], axis: "x" }, 20],
    [30, { grid: [5, 4], from: 3, axis: "y", reversed: true }, 20],
    [25, { start: 100, from: 2 }, 7],
  ];
  it.each(cases)("%o %o", (v, o, n) => {
    const a = stagger(v, o as never), b = ES3.stagger(v, o);
    for (let i = 0; i < n; i++) expect(a(i, n)).toBe(b(i, n));
  });
});

describe("timeline position", () => {
  it.each([500, "+=200", "-=100", "<", "<<", "<<+=100", "<-=50", "250", null])("%s", (p) => {
    expect(position(p as never, 100, 400, 900)).toBe(ES3.position(p, 100, 400, 900));
  });
});
