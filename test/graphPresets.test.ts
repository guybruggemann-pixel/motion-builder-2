import { describe, expect, it } from "vitest";
import { ease, easeString, GRAPH_PRESETS, SPRING_FEELS } from "@core/motion";

describe("Graph ease presets", () => {
  it("spring tiles are exactly the spring feels", () => {
    const springs = GRAPH_PRESETS.find((g) => g.group === "Springs")!.items;
    expect(springs.map((s) => s.name)).toEqual(SPRING_FEELS.map((f) => f.name));
    expect(springs[0]!.ease).toBe(easeString({ ease: "spring", amount: 15, duration: 900 }));
  });
  it("every preset is an ease the engine runs, ending at 1", () => {
    for (const g of GRAPH_PRESETS) for (const p of g.items) expect(ease(p.ease)(1)).toBeCloseTo(1, 2);
  });
});
