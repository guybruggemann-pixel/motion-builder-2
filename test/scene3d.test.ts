/**
 * 3D scene layer (roadmap 3D-a, step 1): the catalog nodes, validation of material inputs, and the
 * evaluator's plain-data scene (objects, camera, lights, materials) that three.js will draw.
 */
import { describe, expect, it } from "vitest";
import {
  apply4,
  approxMeasure,
  evaluateFrame,
  objectMatrix,
  runsBox,
  title3d,
  validateDoc,
  verticalFov,
  zoomFor,
  type Scene3DDrawable,
  type SceneDoc,
} from "@core/scene";

const scene = (doc: SceneDoc, t: number, net = "main") => evaluateFrame(doc, net, t, { measure: approxMeasure }).find((d) => d.kind === "scene3d") as Scene3DDrawable;
const inner = (doc: SceneDoc) => doc.networks.find((n) => n.id === "title-3d")!;
const close = (a: number[], b: number[], eps = 1e-9) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, -Math.log10(eps)));

describe("3D scene layer", () => {
  it("the example validates", () => {
    const r = validateDoc(title3d);
    expect(r.ok, r.ok ? "" : r.errors.join("\n")).toBe(true);
  });

  it("draws as one layer from [0, 0] to its size, under the 2D label", () => {
    const ds = evaluateFrame(title3d, "main", 1, { measure: approxMeasure });
    expect(ds.map((d) => d.kind)).toEqual(["scene3d", "text", "text", "text"]); // the label has three lines
    const s = ds[0] as Scene3DDrawable;
    expect(s.size).toEqual([1920, 1080]);
    expect(s.matrix).toEqual([1, 0, 0, 1, 0, 0]);
    expect(s.scene.ambientOcclusion).toBe(0.6);
  });

  it("resolves the wired material, brand tokens included", () => {
    const m = scene(title3d, 1).scene.objects[0]!.material;
    expect(m).toMatchObject({ node: "plaster", kind: "plaster", color: "#ECE8E1", roughness: 0.9, grain: 0.35 });
  });

  it("falls back to a plastic in the object's fill without a material (or with a disabled one)", () => {
    const d = structuredClone(title3d);
    inner(d).nodes.find((n) => n.id === "plaster")!.enabled = false;
    expect(scene(d, 1).scene.objects[0]!.material).toMatchObject({ kind: "plastic", color: "#FFFFFF" });
  });

  it("keys the object's transform: rotation passes through zero halfway (inOutSine)", () => {
    const o0 = scene(title3d, 0).scene.objects[0]!;
    close(o0.matrix, objectMatrix([0, 0, 0], [8, -35, 0], [100, 100, 100], [0, 0, 0]));
    const o3 = scene(title3d, 3).scene.objects[0]!;
    close(o3.matrix, objectMatrix([0, 0, 0], [0, 0, 0], [100, 100, 100], [0, 0, 0]));
  });

  it("centres text on its origin and carries the extrusion", () => {
    const o = scene(title3d, 1).scene.objects[0]!;
    if (o.kind !== "text") throw new Error("expected text");
    const [x, y, w, h] = runsBox(o.runs, o.font.size);
    expect(o.origin).toEqual([x + w / 2, y + h / 2]);
    expect(o).toMatchObject({ depth: 90, bevel: 4, font: { family: "Inter Tight", weight: 800, size: 300 } });
  });

  it("uses the scene's camera, with AE's lens maths", () => {
    const cam = scene(title3d, 1).scene.camera;
    expect(cam.node).toBe("camera");
    expect(cam.position[2]).toBeCloseTo(zoomFor(1920, 50), 1);
    expect(cam.fov).toBeCloseTo(verticalFov(50, 1920, 1080), 9);
    expect(verticalFov(50, 1920, 1080)).toBeCloseTo((2 * Math.atan(10.125 / 50) * 180) / Math.PI, 9);
  });

  it("without a camera, sees the z = 0 plane 1:1 like AE", () => {
    const d = structuredClone(title3d);
    inner(d).wires = inner(d).wires.filter((w) => w.from.node !== "camera");
    inner(d).nodes = inner(d).nodes.filter((n) => n.id !== "camera");
    const cam = scene(d, 1).scene.camera;
    expect(cam.node).toBeUndefined();
    expect(cam.position).toEqual([0, 0, zoomFor(1920, 50)]);
    expect(zoomFor(1920, 50)).toBeCloseTo(2666.667, 2);
  });

  it("lists lights, and leaves out nodes outside their in/out", () => {
    expect(scene(title3d, 1).scene.lights).toHaveLength(1);
    const d = structuredClone(title3d);
    inner(d).nodes.find((n) => n.id === "key")!.timing = { in: 2, out: 4 };
    expect(scene(d, 1).scene.lights).toHaveLength(0);
    expect(scene(d, 3).scene.lights).toHaveLength(1);
  });

  it("opening the 3D network shows the same scene as one drawable", () => {
    const ds = evaluateFrame(title3d, "title-3d", 1, { measure: approxMeasure });
    expect(ds).toHaveLength(1);
    expect(ds[0]!.kind).toBe("scene3d");
    // same scene; object ids differ only by the instance path (none when the network is opened itself)
    const strip = (sc: Scene3DDrawable["scene"]) => ({ ...sc, objects: sc.objects.map((o) => ({ ...o, id: o.node })), lights: sc.lights.map((l) => ({ ...l, id: l.node })) });
    expect(strip((ds[0] as Scene3DDrawable).scene)).toEqual(strip(scene(title3d, 1).scene));
  });

  it("is deterministic", () => {
    expect(scene(title3d, 2.37)).toEqual(scene(title3d, 2.37));
  });

  it("rotates like three.js ('XYZ' Euler): 90° about Y turns +x into -z", () => {
    const p = apply4(objectMatrix([0, 0, 0], [0, 90, 0], [100, 100, 100], [0, 0, 0]), [1, 0, 0]);
    close(p, [0, 0, -1]);
  });
});

describe("material inputs", () => {
  const withWires = (wires: (w: SceneDoc["networks"][number]["wires"]) => SceneDoc["networks"][number]["wires"]) => {
    const d = structuredClone(title3d);
    inner(d).wires = wires(inner(d).wires);
    return validateDoc(d);
  };

  it("rejects a material wired anywhere but a material input", () => {
    const r = withWires((w) => [...w, { from: { node: "plaster", port: "out" }, to: { node: "merge", port: "in" } }]);
    expect(r.ok).toBe(false);
  });

  it("rejects two materials on one input", () => {
    const d = structuredClone(title3d);
    inner(d).nodes.push({ ...inner(d).nodes.find((n) => n.id === "plaster")!, id: "glass", name: "Glass" });
    inner(d).wires.push({ from: { node: "glass", port: "out" }, to: { node: "word", port: "material" } });
    const r = validateDoc(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/word\.material: 2 wires/);
  });

  it("rejects a non-material into a material input", () => {
    const r = withWires((w) => [...w.filter((x) => x.to.port !== "material"), { from: { node: "camera", port: "out" }, to: { node: "word", port: "material" } }]);
    expect(r.ok).toBe(false);
  });

  it("only Subnet and Scene3D nodes open networks", () => {
    const d = structuredClone(title3d);
    d.networks[0]!.nodes.find((n) => n.id === "label")!.subnet = "title-3d";
    expect(validateDoc(d).ok).toBe(false);
  });
});
