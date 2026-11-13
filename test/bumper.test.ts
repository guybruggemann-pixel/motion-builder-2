import { describe, it, expect } from "vitest";
import { groeneClubBumper } from "@core/scene/presets/bumper";
import { validateDoc } from "@core/scene/validate";

describe("De Groene Club bumper", () => {
  it("is a valid doc of at most 1 second", () => {
    const doc = groeneClubBumper();
    const r = validateDoc(doc); expect(r.ok ? [] : r.errors).toEqual([]);
    expect(doc.networks[0]!.comp.duration).toBeLessThanOrEqual(1);
  });
});
