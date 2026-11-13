/**
 * Materials from the Library: presets write Material nodes (in place when only one object uses
 * it, a new node when it's shared), existing nodes can be shared, kinds bring their defaults, and
 * everything stays valid. 2D layers get a Solid fill.
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { approxMeasure, evaluateFrame, lowerThird, MATERIAL_PRESETS, presetParams, title3d, validateDoc, type Scene3DDrawable, type SceneDoc } from "@core/scene";
import { applyItemRecipe, applyPresetTo, libraryTarget, materialOf, setMaterialKind, useMaterialNode, usersOf } from "@/app/panels/materials";
import { toggleKey } from "@/app/inspector/edits";

const preset = (id: string) => MATERIAL_PRESETS.find((p) => p.id === id)!;
const inner = (d: SceneDoc) => d.networks.find((n) => n.id === "title-3d")!;
const sceneAt = (d: SceneDoc) => (evaluateFrame(d, "main", 1, { measure: approxMeasure }).find((x) => x.kind === "scene3d") as Scene3DDrawable).scene;

/** title3d with a second object that shares the plaster material. */
const shared = produce(title3d, (d) => {
  const net = inner(d as SceneDoc);
  net.nodes.push({ ...net.nodes.find((n) => n.id === "word")!, id: "word-2", name: "Title 2" });
  net.wires.push({ from: { node: "word-2", port: "out" }, to: { node: "merge", port: "in" } }, { from: { node: "plaster", port: "out" }, to: { node: "word-2", port: "material" } });
});

describe("material presets", () => {
  it("applying a look at the playhead preserves earlier material keys", () => {
    const d = produce(title3d, (x) => {
      toggleKey(x, "title-3d", "plaster", "roughness", 0, 0.02, 0.45);
      applyPresetTo(x, "title-3d", "word", preset("chrome"), 2, 0.02);
    });
    expect(inner(d).nodes.find((n) => n.id === "plaster")?.params.roughness?.keys?.map((k) => [k.t, k.v])).toEqual([[0, 0.45], [2, 0.04]]);
    expect(validateDoc(d).ok).toBe(true);
  });
  it("material kind can be keyframed and is evaluated as a held choice", () => {
    const d = produce(title3d, (x) => {
      toggleKey(x, "title-3d", "plaster", "kind", 0, 0.02, "plaster");
      setMaterialKind(x, "title-3d", "plaster", "glass", 2);
    });
    expect(sceneAt(d).objects[0]?.material.kind).toBe("plaster");
    expect(validateDoc(d).ok).toBe(true);
    const frame = evaluateFrame(d, "main", 2, { measure: approxMeasure }).find((x) => x.kind === "scene3d") as Scene3DDrawable;
    expect(frame.scene.objects[0]?.material.kind).toBe("glass");
  });
  it("every preset is a valid material", () => {
    for (const p of MATERIAL_PRESETS) {
      const d = produce(title3d, (x) => void applyPresetTo(x, "title-3d", "word", p));
      const r = validateDoc(d);
      expect(r.ok, `${p.id}: ${r.ok ? "" : r.errors.join()}`).toBe(true);
    }
  });

  it("updates the object's own material in place", () => {
    const d = produce(title3d, (x) => void applyPresetTo(x, "title-3d", "word", preset("chrome")));
    const net = inner(d);
    expect(materialOf(net, "word")!.id).toBe("plaster"); // same node, new look
    expect(materialOf(net, "word")!.name).toBe("Chrome");
    expect(sceneAt(d).objects[0]!.material).toMatchObject({ kind: "metal", metalness: 1, roughness: 0.04, color: "#D3D8DA" });
  });

  it("leaves a shared material alone and gives the object a new one", () => {
    const d = produce(shared, (x) => void applyPresetTo(x, "title-3d", "word", preset("glass")));
    const net = inner(d);
    expect(materialOf(net, "word-2")!.id).toBe("plaster");
    expect(materialOf(net, "word")!).toMatchObject({ id: "glass", name: "Glass" });
    expect(usersOf(net, "plaster")).toBe(1);
    expect(validateDoc(d).ok).toBe(true);
  });

  it("shares an existing material node", () => {
    const d = produce(title3d, (x) => {
      applyPresetTo(x, "title-3d", "word", preset("gold"));
      x.networks.find((n) => n.id === "title-3d")!.nodes.push({ id: "neon", type: "Material", name: "Neon", enabled: true, params: {}, ui: { x: 0, y: 0 } });
      useMaterialNode(x, "title-3d", "word", "neon");
    });
    expect(materialOf(inner(d), "word")!.id).toBe("neon");
    expect(validateDoc(d).ok).toBe(true);
  });

  it("changing the kind brings that kind's defaults and keeps the colour", () => {
    const d = produce(title3d, (x) => setMaterialKind(x, "title-3d", "plaster", "glass"));
    expect(sceneAt(d).objects[0]!.material).toMatchObject({ kind: "glass", transmission: 1, roughness: 0.05, color: "#ECE8E1" });
  });

  it("presetParams includes kind, colour and the kind defaults", () => {
    expect(presetParams(preset("neon"))).toMatchObject({ kind: "emissive", color: "#C3FC2F", emission: 2.5 });
  });
});

describe("where Library items land", () => {
  const main = title3d.networks.find((n) => n.id === "main")!;

  it("a 3D scene layer passes the item to its first object, in the scene's time", () => {
    const scene = main.nodes.find((n) => n.id === "scene")!;
    expect(libraryTarget(title3d, main, scene, 2)).toEqual({ net: "title-3d", node: "word", t: 2, is3D: true });
  });

  it("a colour on a 3D object colours its material; on a 2D layer it's the fill", () => {
    const t3 = libraryTarget(title3d, inner(title3d), inner(title3d).nodes.find((n) => n.id === "word")!, 1)!;
    const d = produce(title3d, applyItemRecipe(t3, { kind: "colour", value: "#FF0000", name: "Red" }, 0.02));
    expect(sceneAt(d).objects[0]!.material.color).toBe("#FF0000");

    const lt = lowerThird.networks.find((n) => n.id === "lower-third")!;
    const t2 = libraryTarget(lowerThird, lt, lt.nodes.find((n) => n.id === "panel")!, 1)!;
    const d2 = produce(lowerThird, applyItemRecipe(t2, { kind: "preset", preset: preset("gold") }, 0.02));
    const panel = d2.networks.find((n) => n.id === "lower-third")!.nodes.find((n) => n.id === "panel")!;
    expect(JSON.stringify(panel.params.fill)).toContain("#FFE496");
  });
});
