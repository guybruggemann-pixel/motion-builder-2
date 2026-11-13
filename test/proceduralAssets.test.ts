import { describe, expect, it } from "vitest";
import { assetFactory, evaluateFrame, PRESETS, validateDoc } from "@core/scene";
import { capsuleGeometry } from "@/app/render/three/pass";

describe("procedural assets", () => {
  it("wraps exactly eight seeded ellipse nodes in a blurred threshold subnet", () => {
    const doc = assetFactory("gooey-paint-splash");
    expect(doc).toEqual(assetFactory("gooey-paint-splash"));
    expect(doc.networks[1]?.nodes.filter((n) => n.params.shape?.value === "ellipse")).toHaveLength(8);
    const drawable = evaluateFrame(doc, doc.root, 1)[0];
    expect(drawable).toMatchObject({ kind: "subnet", blur: 26, alphaThreshold: 0.42 });
    expect(drawable?.kind === "subnet" && drawable.children?.length).toBe(8);
  });
  it("arranges twelve rays radially, expands them and fades all by 0.8 seconds", () => {
    const doc = assetFactory("sparkle-burst");
    const rays = doc.networks[1]?.nodes.filter((n) => n.type === "Shape") ?? [];
    expect(rays).toHaveLength(12);
    expect(rays.map((n) => n.params.rotation?.value)).toEqual(Array.from({ length: 12 }, (_, i) => i * 30));
    expect(evaluateFrame(doc, doc.root, 0.2).some((d) => Math.abs(d.matrix[0]) > 0.5)).toBe(true);
    expect(evaluateFrame(doc, doc.root, 0.8).every((d) => d.opacity === 0)).toBe(true);
  });
  it("creates a glass capsule with exact material, vertical drift and X rotation", () => {
    const doc = assetFactory("glass-ui-pill");
    const frame = evaluateFrame(doc, doc.root, 0).find((d) => d.kind === "scene3d");
    if (frame?.kind !== "scene3d") throw new Error("Missing scene");
    const pill = frame.scene.objects[0];
    if (pill?.kind !== "shape") throw new Error("Missing capsule");
    expect(pill.shape).toBe("capsule");
    expect(pill.material).toMatchObject({ kind: "glass", color: "#FFFFFF", roughness: 0.1 });
    const g = capsuleGeometry(pill); g.computeBoundingBox();
    expect(g.boundingBox?.max.x).toBeCloseTo(380, 2);
    expect(g.boundingBox?.max.y).toBeCloseTo(120, 2);
    expect(g.boundingBox?.max.z).toBeCloseTo(120, 2);
    const end = evaluateFrame(doc, doc.root, 3).find((d) => d.kind === "scene3d");
    expect(pill.matrix[13]).toBe(-50);
    expect(end?.kind === "scene3d" && end.scene.objects[0]?.matrix[13]).toBe(50);
    expect(end?.kind === "scene3d" && end.scene.objects[0]?.matrix[6]).not.toBe(pill.matrix[6]);
    g.dispose();
  });
  it("scales nine tiles sequentially using a real stagger modifier", () => {
    const doc = assetFactory("kinetic-grid");
    expect(doc.networks[1]?.nodes.filter((n) => n.type === "Shape")).toHaveLength(9);
    const partial = evaluateFrame(doc, doc.root, 0.04);
    expect(partial[0]?.matrix[0]).toBeGreaterThan(0);
    expect(partial[1]?.matrix[0]).toBe(0);
    expect(evaluateFrame(doc, doc.root, 1).every((d) => d.matrix[0] === 1)).toBe(true);
  });
  it("exports all four as valid Shapes presets", () => {
    for (const id of ["gooey-paint-splash", "sparkle-burst", "glass-ui-pill", "kinetic-grid"]) {
      const p = PRESETS.find((p) => p.id === id);
      expect(p?.category).toBe("shape");
      expect(p && validateDoc(p.build()).ok).toBe(true);
    }
  });
});