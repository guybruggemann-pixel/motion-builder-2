import { describe, expect, it } from "vitest";
import { approxMeasure, buildPattern, checkPatternRecipe, deformPoint, evaluateFrame, fieldWeight, makeClones, validateDoc, waveWall, wavePhase, type DeformSpec, type SceneDoc } from "@core/scene";

const D: DeformSpec = { mode: "wave", position: [0, 0, 0], angle: 0, amount: 50, wavelength: 400, phase: 0, displace: "side", strength: 1 };
const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 4));

describe("deformers", () => {
  it("wave moves points across the axis by amount * sin", () => {
    near(deformPoint(D, [100, 0, 0]), [100, 50, 0]);
    near(deformPoint(D, [0, 10, 5]), [0, 10, 5]);
    near(deformPoint({ ...D, displace: "depth" }, [100, 0, 0]), [100, 0, 50]);
    near(deformPoint({ ...D, angle: 90 }, [0, 100, 0]), [-50, 100, 0]);
  });
  it("twist turns around the axis, bend curls it, strength 0 does nothing", () => {
    near(deformPoint({ ...D, mode: "twist", amount: 90 }, [400, 10, 0]), [400, 0, 10]);
    const b = deformPoint({ ...D, mode: "bend", amount: 90 }, [400, 0, 0]);
    expect(b[1]).toBeGreaterThan(100);
    near(deformPoint({ ...D, strength: 0 }, [100, 0, 0]), [100, 0, 0]);
  });
  it("looping waves make whole cycles over the span", () => {
    const span = 6;
    expect(Math.cos(wavePhase(0.34, span, span, true))).toBeCloseTo(Math.cos(wavePhase(0.34, 0, span, true)), 6);
  });
});

describe("wave field and cloner", () => {
  it("wave field is 0.5 at the origin and peaks a quarter wave along", () => {
    const f = { kind: "wave" as const, position: [0, 0, 0] as [number, number, number], angle: 0, wavelength: 400, phase: 0, invert: false };
    expect(fieldWeight(f, [0, 0, 0])).toBeCloseTo(0.5);
    expect(fieldWeight(f, [100, 0, 0])).toBeCloseTo(1);
  });
  it("row offset shifts each row and scroll wraps within the row", () => {
    const base = { mode: "grid" as const, count: [2, 2, 1] as [number, number, number], spacing: [100, 100, 0] as [number, number, number], step: [0, 0, 0] as [number, number, number], stepRotation: [0, 0, 0] as [number, number, number], radius: 0, plane: "xy" as const, align: false, rowSlide: 0 };
    const a = makeClones({ ...base, rowOffset: 20 });
    expect(a[2]!.position[0] - a[0]!.position[0]).toBeCloseTo(20);
    const s = makeClones({ ...base, scroll: 250 });
    for (const c of s) expect(Math.abs(c.position[0])).toBeLessThanOrEqual(100);
  });
});

describe("wave wall", () => {
  it("is a valid doc with a cloner, wave field, deformer and every clone deformed", () => {
    const d = waveWall();
    expect(validateDoc(d).ok).toBe(true);
    const scene = d.networks.find((n) => n.id === "wall-3d")!;
    expect(scene.nodes.map((n) => n.type)).toEqual(expect.arrayContaining(["Cloner", "WaveField", "Deformer", "Plain", "Text3D"]));
    const frame = evaluateFrame(d, "main", 0, { measure: approxMeasure }) as unknown as { kind: string; scene?: { objects: { clones?: unknown[]; deformers?: unknown[] }[] } }[];
    const obj = frame.find((x) => x.kind === "scene3d")!.scene!.objects[0]!;
    expect(obj.clones!.length).toBeGreaterThanOrEqual(36);
    expect(obj.deformers).toHaveLength(1);
  });
  it("split letters become one object each", () => {
    const d: SceneDoc = structuredClone(waveWall({ word: "ABC" }));
    d.networks.find((n) => n.id === "wall-3d")!.nodes.find((n) => n.id === "word")!.params.split = { value: "characters" };
    const frame = evaluateFrame(d, "main", 0, { measure: approxMeasure }) as unknown as { kind: string; scene?: { objects: unknown[] } }[];
    expect(frame.find((x) => x.kind === "scene3d")!.scene!.objects).toHaveLength(3);
  });
});

describe("pattern recipe", () => {
  it("cleans the AI's numbers and rejects unknown patterns", () => {
    expect(checkPatternRecipe({ kind: "none" })).toBeUndefined();
    const r = checkPatternRecipe({ kind: "wave-wall", word: "<b>Hi</b>", rows: 999, tilt: 500, color: "red", material: "wood" })!;
    expect(r.rows).toBe(24);
    expect(r.tilt).toBe(90);
    expect(r.color).toBe("#E9E9E9");
    expect(r.material).toBe("plastic");
    expect(r.word).toBe("bHib");
    expect(validateDoc(buildPattern(r, { width: 720, height: 1068, duration: 5 }, "Ref")).ok).toBe(true);
  });
});
