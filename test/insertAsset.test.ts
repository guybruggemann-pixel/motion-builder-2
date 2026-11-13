import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { lowerThird, validateDoc, evaluateFrame, approxMeasure } from "@core/scene";
import { insertAsset, type ArtworkAsset } from "@/app/assets/insertAsset";

const asset: ArtworkAsset = { id: "test-star", name: "Star", category: "icons", src: "data:image/png;base64,aGVsbG8=", width: 512, height: 512, source: "Tabler Icons", license: "MIT", attribution: "MIT attribution" };
describe("curated artwork insertion", () => {
  it("adds artwork without changing any supplied layer", () => {
    const original = lowerThird.networks[0]?.nodes.filter((n) => n.type !== "Merge");
    const doc = produce(lowerThird, (d) => { insertAsset(d, "main", asset); });
    expect(doc.networks[0]?.nodes.filter((n) => original?.some((o) => o.id === n.id))).toEqual(original);
    expect(validateDoc(doc).ok).toBe(true);
    expect(evaluateFrame(doc, "main", 1, { measure: approxMeasure }).some((d) => d.kind === "image")).toBe(true);
  });
  it("embeds source and attribution, reuses bytes but creates independent layers", () => {
    const doc = produce(lowerThird, (d) => { insertAsset(d, "main", asset); insertAsset(d, "main", asset); });
    expect(doc.assets.filter((a) => a.id === "library-test-star")).toHaveLength(1);
    expect(doc.assets.find((a) => a.id === "library-test-star")).toMatchObject({ src: asset.src, meta: { license: "MIT", attribution: "MIT attribution" } });
    expect(doc.networks[0]?.nodes.filter((n) => n.name === "Star")).toHaveLength(2);
    expect(validateDoc(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
  });
  it("rejects external references instead of saving nonportable artwork", () => {
    expect(() => produce(lowerThird, (d) => { insertAsset(d, "main", { ...asset, src: "https://example.com/star.png" }); })).toThrow("embedded");
  });
});