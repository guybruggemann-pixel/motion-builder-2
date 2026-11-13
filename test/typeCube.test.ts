import { describe, expect, it } from "vitest";
import { typeCube, cubeRowKeys, checkCubeRecipe, TYPE_CUBE_DEFAULTS, validateDoc } from "@core/scene";

describe("type cube", () => {
  const doc = typeCube();
  const scene = doc.networks.find((n) => n.id === "cube-3d")!;
  it("is a valid doc", () => { const r = validateDoc(doc) as { ok: boolean; errors?: unknown }; expect(r.errors ?? []).toEqual([]); expect(r.ok).toBe(true); });
  it("puts the words of a row on adjacent faces, 90° apart", () => {
    const rot = (id: string) => (scene.nodes.find((n) => n.id === id)!.params.rotation as { value: number[] }).value[1];
    expect([rot("r0f0"), rot("r0f1"), rot("r0f2"), rot("r0f3")]).toEqual([0, 90, 180, 270]);
  });
  it("words of one row share the turn; rows start one delay apart", () => {
    const a = cubeRowKeys(TYPE_CUBE_DEFAULTS, 0, 0), b = cubeRowKeys(TYPE_CUBE_DEFAULTS, 1, 0), f1 = cubeRowKeys(TYPE_CUBE_DEFAULTS, 0, 90);
    expect(b[1]!.t - a[1]!.t).toBeCloseTo(0.08);
    expect(f1.map((k) => k.v[1]! - 90)).toEqual(a.map((k) => k.v[1]));
  });
  it("ends on a whole turn so it loops", () => {
    const k = cubeRowKeys(TYPE_CUBE_DEFAULTS, 4, 0);
    expect(k.at(-1)!.v[1]! % 180).toBe(0);
    expect(k.at(-1)!.t).toBeLessThanOrEqual(doc.networks[0]!.comp!.duration);
  });
  it("cleans AI recipes", () => {
    expect(checkCubeRecipe({ kind: "none" })).toBeUndefined();
    const r = checkCubeRecipe({ kind: "type-cube", words: ["hoop", "cities"], rows: 99, turn: 90 })!;
    expect(r.rows).toBe(12);
    expect(r.faces).toEqual(["hoop", "cities"]);
  });
});
