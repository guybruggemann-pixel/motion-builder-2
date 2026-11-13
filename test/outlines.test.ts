/**
 * Glyph outlines for 3D text (roadmap 3D-a, step 2): the bundled variable WOFF2 fonts unpack to
 * TTF, the weight axis changes the outlines, glyphs come out closed and positioned like the canvas
 * draws a run (pen from run.x, baseline at run.y, tracking after every glyph).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { OutlineFonts, type GlyphOutline } from "@/app/render/outlines";

const require = createRequire(import.meta.url);
const decompress = require("wawoff2/decompress") as (b: Uint8Array) => Promise<Uint8Array>;
const file = (name: string) => new Uint8Array(readFileSync(require.resolve(`@fontsource-variable/${name}`)));

let fonts: OutlineFonts;
beforeAll(async () => {
  fonts = await OutlineFonts.fromWoff2(
    {
      "Inter Tight": [file("inter-tight/files/inter-tight-latin-wght-normal.woff2"), file("inter-tight/files/inter-tight-latin-ext-wght-normal.woff2")],
      Inter: [file("inter/files/inter-latin-wght-normal.woff2")],
    },
    decompress,
  );
}, 30_000);

const font = (weight: number, size = 300) => ({ family: "Inter Tight", weight, size });
const contours = (g: GlyphOutline) => g.cmds.filter((c) => c.op === "M").length;

describe("glyph outlines", () => {
  it("registers an imported raw font for 3D lettering with the same glyph widths", async () => {
    const bytes = await decompress(file("inter-tight/files/inter-tight-latin-wght-normal.woff2"));
    const custom = new OutlineFonts(new Map());
    custom.register("User font", [bytes]);
    expect(custom.has("User font")).toBe(true);
    expect(custom.width("techonomy", { family: "User font", weight: 700, size: 100 })).toBeCloseTo(fonts.width("techonomy", { family: "Inter Tight", weight: 700, size: 100 }), 6);
    expect(custom.runOutlines({ text: "is awesome", x: 0, y: 0 }, { family: "User font", weight: 700, size: 100 })).toHaveLength(10);
  });
  it("gives one closed outline per glyph; O and other counters keep their holes", () => {
    const gs = fonts.runOutlines({ text: "MOTION", x: 0, y: 0 }, font(800));
    expect(gs.map((g) => g.text).join("")).toBe("MOTION");
    expect(contours(gs[1]!)).toBe(2); // O: outside and the hole
    expect(contours(gs[0]!)).toBe(1); // M
    for (const g of gs) {
      const ms = g.cmds.filter((c) => c.op === "M").length;
      const zs = g.cmds.filter((c) => c.op === "Z").length;
      expect(zs, g.text).toBe(ms);
    }
  });

  it("applies the weight axis: heavier is wider and the strokes are fatter", () => {
    expect(fonts.width("MOTION", font(800))).toBeGreaterThan(fonts.width("MOTION", font(400)));
    const xs = (g: GlyphOutline) => g.cmds.flatMap((c) => (c.op === "Z" ? [] : c.p.filter((_, i) => i % 2 === 0)));
    const span = (w: number) => {
      const I = fonts.runOutlines({ text: "I", x: 0, y: 0 }, font(w))[0]!;
      return Math.max(...xs(I)) - Math.min(...xs(I));
    };
    expect(span(900)).toBeGreaterThan(span(300) * 2);
  });

  it("positions glyphs like the canvas: from the run's x, on its baseline, tracking after each", () => {
    const plain = fonts.runOutlines({ text: "MOTION", x: 100, y: 500 }, font(800));
    const tracked = fonts.runOutlines({ text: "MOTION", x: 100, y: 500 }, font(800), 20);
    expect(plain[0]!.x).toBe(100);
    tracked.forEach((g, i) => expect(g.x).toBeCloseTo(plain[i]!.x + 20 * i, 9));
    // glyphs sit on the baseline: caps rise above y = 500 (y is down), nothing hangs far below
    const ys = plain.flatMap((g) => g.cmds.flatMap((c) => (c.op === "Z" ? [] : c.p.filter((_, i) => i % 2 === 1))));
    expect(Math.min(...ys)).toBeLessThan(500 - 300 * 0.6);
    expect(Math.max(...ys)).toBeLessThan(500 + 300 * 0.05);
  });

  it("scales with the size", () => {
    expect(fonts.width("MOTION", font(700, 200)) * 1.5).toBeCloseTo(fonts.width("MOTION", font(700, 300)), 6);
  });

  it("finds letters in the latin-ext subset and reports what no subset covers", () => {
    const gs = fonts.runOutlines({ text: "Łódź", x: 0, y: 0 }, font(600));
    expect(gs.map((g) => g.text).join("")).toBe("Łódź");
    expect(gs.every((g) => g.cmds.length > 0)).toBe(true);
    expect(fonts.missing("Łódź 東", "Inter Tight")).toEqual(["東"]);
  });

  it("is deterministic", () => {
    expect(fonts.runOutlines({ text: "Ag", x: 3, y: 7 }, font(650))).toEqual(fonts.runOutlines({ text: "Ag", x: 3, y: 7 }, font(650)));
  });
});
