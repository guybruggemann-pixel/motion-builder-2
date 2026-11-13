import { describe, expect, it } from "vitest";
import { boxPoster, cardTrail, checkShowcaseRecipe, countText, counterPill, evaluateFrame, saasPromo, validateDoc } from "@core/scene";

const measure = (t: string, o: { size: number }) => t.length * o.size * 0.5;
const at = (d: ReturnType<typeof counterPill>, t: number) => evaluateFrame(d, "main", t, { measure } as never);

describe("second reference set", () => {
  it("counter text: {n} shows the keyed number at fixed decimals", () => {
    expect(countText(9.6, 0)).toBe("10");
    expect(countText(2.345, 1)).toBe("2.3");
    const d = counterPill();
    const txt = (t: number) => (at(d, t).find((x) => x.kind === "text" && (x as { text: string }).text.includes("x better")) as { text: string }).text;
    expect(txt(0.1)).toBe("2x better");
    expect(txt(3)).toBe("10x better");
  });
  it("gradient fills reach the drawables", () => {
    const pill = at(counterPill(), 2).find((x) => x.kind === "shape" && (x as { gradient?: unknown }).gradient) as { gradient: { type: string; to: string } };
    expect(pill.gradient).toMatchObject({ type: "linear", to: "#E6DDF8" });
  });
  it("card trail loops: every tile ends where the tile `tiles` places later started", () => {
    const d = cardTrail({ tiles: 8, duration: 10, speed: 1 });
    const tiles = d.networks[0]!.nodes.filter((n) => n.name.startsWith("Tile "));
    const k = (n: (typeof tiles)[0]) => n.params.position!.keys!;
    expect(k(tiles[0]!).at(-1)!.v).toEqual(k(tiles[16]!)[0]!.v);
  });
  it("box poster squashes words to their box and doubles them up", () => {
    const d = boxPoster();
    const run = d.networks[0]!.nodes.find((n) => n.name === "RUN")!;
    expect(run.params.text!.keys!.some((k) => k.v === "RUNRUN")).toBe(true);
  });
  it("the SaaS promo chains four parts as precomps", () => {
    const d = saasPromo();
    expect(validateDoc(d).ok).toBe(true);
    expect(d.networks[0]!.nodes.filter((n) => n.type === "Subnet")).toHaveLength(4);
    for (let t = 0; t < 14; t += 1) expect(evaluateFrame(d, "main", t, { measure } as never).length).toBeGreaterThan(0);
  });
  it("rebuild recipes are cleaned", () => {
    const s = { width: 1920, height: 1080, duration: 8 };
    expect(checkShowcaseRecipe({ kind: "nope" }, s, "x")).toBeUndefined();
    const d = checkShowcaseRecipe({ kind: "sentence", words: ["<b>Hi</b>", 3, "there"], colorA: "red" }, s, "x")!;
    expect(d.networks[0]!.nodes.filter((n) => n.type === "Text").map((n) => n.params.text!.value)).toEqual(["bHib", "there"]);
    expect(validateDoc(checkShowcaseRecipe({ kind: "box-poster", cells: [{ x: 0, y: 0, w: 2, h: 1, word: "go" }, { x: 0.5, w: 0.5, h: 0.5 }] }, s, "x")!).ok).toBe(true);
  });
});

import { buildAePlan } from "@/app/export/aePlan";
describe("AE export of counters and gradients", () => {
  it("counter text gets Source Text keys, gradient fills a ramp", () => {
    const plan = buildAePlan(counterPill(), "main", ((t: string, o: { size: number }) => t.length * o.size * 0.5) as never);
    const layers = plan.comps.flatMap((c) => c.layers);
    const counter = layers.find((l) => l.text?.str.includes("x better"))!;
    expect(counter.text!.changes![0]![1]).toBe("2x better");
    expect(counter.text!.changes!.at(-1)![1]).toBe("10x better");
    expect(layers.find((l) => l.ramp)!.ramp!.shape).toBe(1);
  });
});
