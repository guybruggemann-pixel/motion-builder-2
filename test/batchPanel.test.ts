import { describe, expect, it } from "vitest";
import { lowerThirdFit, validateDoc } from "@core/scene";
import { autoMap, newBatch } from "@/app/batch/BatchPanel";

describe("batch setup", () => {
  it("matches Dutch and English column names to the lower third's controls", () => {
    const controls = [{ id: "name", label: "Name" }, { id: "title", label: "Title" }, { id: "accent", label: "Accent colour" }];
    expect(autoMap(["Naam", "Functie", "Bedrijf"], controls)).toEqual({ name: "Naam", title: "Functie" });
    expect(autoMap(["name", "Title", "Color"], controls)).toEqual({ name: "name", title: "Title", accent: "Color" });
  });

  it("starts a batch on the first motion asset instance, and the doc stays valid", () => {
    const b = newBatch(lowerThirdFit)!;
    expect(b.target).toEqual({ network: "main", instance: "lt", mapping: {} });
    expect(b.qcAt).toBeCloseTo(2.5, 9);
    expect(validateDoc({ ...structuredClone(lowerThirdFit), batches: [b] }).ok).toBe(true);
  });
});
