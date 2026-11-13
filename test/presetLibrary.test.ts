import { describe, expect, it } from "vitest";
import { PRESET_CATEGORIES, PRESETS, validateDoc } from "@core/scene";

describe("Import preset library", () => {
  it("has 60 presets covering every category, unique ids", () => {
    expect(PRESETS).toHaveLength(60);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(60);
    for (const c of PRESET_CATEGORIES) expect(PRESETS.some((p) => p.category === c.id)).toBe(true);
  });
  it.each(PRESETS.map((p) => [p.id, p] as const))("%s builds a valid doc", (_, p) => {
    const d = p.build();
    const r = validateDoc(d);
    expect(r.ok, JSON.stringify((r as { errors?: unknown }).errors)).toBe(true);
    expect(p.build()).toEqual(d);
  });
});
