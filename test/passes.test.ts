/** AE passes: visible-coverage mattes, puzzle packing, 3D ID coverage, and what an export writes. */
import { describe, expect, it } from "vitest";
import { lowerThird, title3d } from "@core/scene";
import { alphaOf, idCoverage, matteFrame, puzzleFrame, puzzleGroups, uncovered, visibleCoverage } from "@/app/render/passes/coverage";
import { planPasses } from "@/app/render/passes/plan";

const A = (...v: number[]) => new Uint8Array(v);

describe("matte maths", () => {
  it("visible coverage cuts out what's drawn above", () => {
    // bottom fully there, top half there: bottom keeps half, top keeps its own half
    const [bottom, top] = visibleCoverage([A(255, 255), A(0, 128)]);
    expect([...bottom!]).toEqual([255, 127]);
    expect([...top!]).toEqual([0, 128]);
  });

  it("coverages never add up to more than the pixel", () => {
    const covs = visibleCoverage([A(200, 90, 255), A(100, 250, 255), A(60, 30, 255)]);
    for (let p = 0; p < 3; p++) expect(covs.reduce((s, c) => s + c[p]!, 0)).toBeLessThanOrEqual(256);
  });

  it("reads alphas, writes opaque white-on-black mattes and RGB puzzles", () => {
    expect([...alphaOf(new Uint8ClampedArray([9, 9, 9, 40, 1, 1, 1, 200]))]).toEqual([40, 200]);
    expect([...matteFrame(A(0, 77))]).toEqual([0, 0, 0, 255, 77, 77, 77, 255]);
    expect([...puzzleFrame([A(10), A(20)], 1)]).toEqual([10, 20, 0, 255]);
  });

  it("3D ID coverage is channel × alpha, then cut by layers above the scene", () => {
    const id = new Uint8ClampedArray([255, 0, 0, 128, 0, 255, 0, 255]); // a red edge pixel, then a green one
    expect([...idCoverage(id, 0)]).toEqual([128, 0]);
    const clear = uncovered([A(0, 255)], 2); // a layer above covers the second pixel
    expect([...idCoverage(id, 1, clear)]).toEqual([0, 0]);
  });

  it("groups puzzle elements by three", () => {
    expect(puzzleGroups([1, 2, 3, 4, 5])).toEqual([[1, 2, 3], [4, 5]]);
  });
});

describe("what a passes export writes", () => {
  it("a beauty per layer, a matte per layer and per 3D object, puzzles of three, depth per 3D scene", () => {
    const p = planPasses(title3d, "main", { mattes: true, puzzle: true, depth: true });
    expect(p.elements.map((e) => `${e.kind}:${e.id}`)).toEqual(["layer:scene", "layer:label", "object:scene/word"]);
    expect(p.outputs.map((o) => `${o.kind} ${o.file}`)).toEqual([
      "beauty Main_v01_Title_scene.mov",
      "beauty Main_v01_Label.mov",
      "matte Main_v01_Title_scene_matte.mov",
      "matte Main_v01_Label_matte.mov",
      "matte Main_v01_Title_scene_Title_matte.mov",
      "puzzle Main_v01_puzzle_01.mov",
      "depth Main_v01_Title_scene_depth.mov",
    ]);
    // the scene layer's object has its own channel, so the scene layer itself stays out of the puzzle
    expect(p.outputs.find((o) => o.kind === "puzzle")).toMatchObject({ channels: ["label", "scene/word"], name: "Puzzle 01 · R Label / G Title scene · Title" });
    expect(p.comp).toMatchObject({ width: 1920, height: 1080, fps: 25, frames: 150, background: "#0B0C0F" });
  });

  it("keeps layer timing and skips what's off", () => {
    const p = planPasses(lowerThird, "main", { mattes: false, puzzle: false, depth: true });
    expect(p.outputs).toEqual([{ file: "Main_v01_Lower_third.mov", kind: "beauty", name: "Lower third", element: "lt", in: 0.5, out: 5.5 }]);
  });
  it("normals: one per 3D scene, only when asked", () => {
    const on = planPasses(title3d, "main", { mattes: false, puzzle: false, depth: false, normals: true });
    expect(on.outputs.filter((o) => o.kind === "normal").map((o) => o.file)).toEqual(["Main_v01_Title_scene_normals.mov"]);
    expect(planPasses(lowerThird, "main", { mattes: false, puzzle: false, depth: false, normals: true }).outputs.some((o) => o.kind === "normal")).toBe(false);
  });
});
