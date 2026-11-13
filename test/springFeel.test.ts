import { describe, expect, it } from "vitest";
import { ease, easeChoice, easeString } from "@core/motion";
import { MATERIAL_GROUPS, MATERIAL_PRESETS } from "@core/scene";

describe("spring speed", () => {
  it("keeps the v1 string when speed is default", () => {
    expect(easeString({ ease: "spring", amount: 50 })).toBe("spring(0.500,628)");
  });
  it("writes and reads back a custom speed", () => {
    const s = easeString({ ease: "spring", amount: 25, duration: 350 });
    expect(s).toBe("spring(0.250,350)");
    expect(easeChoice(s)).toEqual({ ease: "spring", amount: 25, duration: 350 });
  });
  it("a shorter spring settles sooner", () => {
    expect(ease("spring(0.25,350)").settlingDuration!).toBeLessThan(ease("spring(0.25,900)").settlingDuration!);
  });
});

describe("material library", () => {
  it("every preset sits in a known group and ids are unique", () => {
    const groups = new Set(MATERIAL_GROUPS.map((g) => g.id));
    for (const p of MATERIAL_PRESETS) expect(groups.has(p.group)).toBe(true);
    expect(new Set(MATERIAL_PRESETS.map((p) => p.id)).size).toBe(MATERIAL_PRESETS.length);
  });
});
