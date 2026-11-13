import { describe, expect, it } from "vitest";
import { buildDesignDoc } from "@core/scene";
import { designMotionContext } from "@/app/import/motionContext";

describe("prompt design context", () => {
  it("supplies exact words, font, ids and resting coordinates for both user phrases", () => {
    const doc = buildDesignDoc({ name: "Techonomy", width: 720, height: 720, source: "svg", layers: [
      { kind: "text", name: "Title", text: "techonomy", font: "Outfit", size: 90, weight: 700, fill: "#FFFFFF", position: [100, 300] },
      { kind: "text", name: "Subline", text: "is awesome", size: 50, weight: 400, fill: "#FFFFFF", position: [100, 400] },
    ] });
    const ctx = designMotionContext(doc);
    expect(ctx.layers.map((n) => [n.node, n.text])).toEqual([["l1", "techonomy"], ["l2", "is awesome"]]);
    expect(ctx.layers[0]?.font).toBe("Outfit");
    expect(ctx.layers[0]?.params.find((p) => p.name === "position")?.value).toEqual([100, 300]);
    expect(ctx.comp).toEqual({ width: 720, height: 720, fps: 25, duration: 5 });
  });
});