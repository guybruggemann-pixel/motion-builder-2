import { describe, expect, it } from "vitest";
import { checkPackage, importC4d, type C4dDump } from "../src/core/library";
import { approxMeasure, evaluateFrame, type Node } from "../src/core/scene";
import { c4dTitle, matrix } from "./fixtures/c4dTitle";

describe("importing a Cinema 4D dump", () => {
  const r = importC4d(c4dTitle);
  const net = (id: string) => r.doc.networks.find((n) => n.id === id)!;
  const node = (id: string): Node => net("title-3d").nodes.find((n) => n.id === id)!;
  const into = (id: string, port = "in") => net("title-3d").wires.filter((w) => w.to.node === id && w.to.port === port).map((w) => w.from.node);

  it("makes main → asset Subnet → one 3D scene layer", () => {
    expect(r.asset).toBe("title");
    expect(net("main").comp).toEqual({ width: 1920, height: 1080, fps: 25, duration: 4 });
    expect(net("main").nodes.map((n) => [n.type, n.subnet])).toEqual([["Subnet", "title"], ["Output", undefined]]);
    expect(net("title").nodes).toMatchObject([{ type: "Scene3D", subnet: "title-3d", params: { size: { value: [1920, 1080] } } }]);
  });

  it("imports text with its turn: heading becomes -Y, tangents become an ease", () => {
    expect(node("title")).toMatchObject({ type: "Text3D", params: { text: { value: "MOTION" }, size: { value: 300 }, depth: { value: 90 }, font: { value: "Inter Tight" }, weight: { value: 800 }, align: { value: "center" } } });
    expect(node("title").params.rotation!.keys).toEqual([{ t: 0, v: [0, 30, 0], ease: "inOutSine" }, { t: 4, v: [0, -30, 0], ease: "linear" }]);
    expect(node("title").params.position).toBeUndefined();
  });

  it("folds a null's position into its children and flips z", () => {
    expect(node("floor")).toMatchObject({ type: "Shape3D", params: { shape: { value: "rect" }, size: { value: [900, 20] }, depth: { value: 500 }, bevel: { value: 0 }, position: { value: [0, -260, 0] } } });
    expect(node("camera").params).toMatchObject({ position: { value: [0, 100, 1800] }, target: { value: [0, 100, 0] }, lens: { value: 50 } });
  });

  it("imports a linear cloner with the object it clones", () => {
    expect(node("row")).toMatchObject({ type: "Cloner", params: { mode: { value: "linear" }, count: { value: [5, 1, 1] }, step: { value: [180, 0, 0] }, position: { value: [0, 240, 0] } } }); // C4D's line runs from -360 to 360; ours is centred
    expect(node("pill")).toMatchObject({ type: "Shape3D", params: { shape: { value: "rect" }, size: { value: [120, 50] }, radius: { value: 25 }, depth: { value: 30 } } });
    expect(node("pill").params.position).toBeUndefined(); // its own local transform, not the cloner's
    expect(into("row")).toEqual(["pill"]);
    expect(into("merge")).toEqual(["title", "floor", "row", "camera", "key"]);
  });

  it("wires materials, inherited from the cloner too, and leaves unused ones out", () => {
    expect(into("floor", "material")).toEqual(["red-material"]);
    expect(into("pill", "material")).toEqual(["glass-material"]);
    expect(node("red-material").params).toMatchObject({ kind: { value: "plastic" }, color: { value: "#E61A1A" }, roughness: { value: 0.25 } });
    expect(node("glass-material").params).toMatchObject({ kind: { value: "glass" }, transmission: { value: 0.9 } });
    expect(net("title-3d").nodes.some((n) => n.name === "Unused")).toBe(false);
  });

  it("imports lights pointing the way they did", () => {
    const key = node("key").params;
    expect(key).toMatchObject({ kind: { value: "spot" }, color: { value: "#FFF2E6" }, intensity: { value: 2.4 }, position: { value: [-600, 900, 900] }, castShadow: { value: true }, angle: { value: 30 } });
    const [x, y, z] = key.target!.value as number[], [px, py, pz] = key.position!.value as number[];
    // the fixture's matrix aims it to the right, down, and into the scene (−z here)
    expect(x! - px!).toBeGreaterThan(0);
    expect(y! - py!).toBeLessThan(0);
    expect(z! - pz!).toBeLessThan(0);
  });

  it("evaluates to a 3D scene with the cloned pills", () => {
    const [scene] = evaluateFrame(r.doc, "main", 2, { measure: approxMeasure }).filter((d) => d.kind === "scene3d");
    expect(scene).toBeDefined();
    const objects = (scene as unknown as { scene: { objects: { node: string; clones?: unknown[] }[] } }).scene.objects;
    expect(objects.find((o) => o.node === "pill")?.clones).toHaveLength(5);
    expect(objects.map((o) => o.node).sort()).toEqual(["floor", "pill", "title"]);
  });

  it("says what it couldn't carry over", () => {
    const has = (re: RegExp) => expect(r.notes.some((n) => re.test(n)), `${re} in\n${r.notes.join("\n")}`).toBe(true);
    has(/"Ball": Sphere objects aren't imported; skipped/);
    has(/"Row": effectors and fields on the cloner aren't imported/);
    has(/"Title": text is placed from its baseline/);
    has(/Material "Glass": only its colour and that it is glass are imported/);
    has(/Light brightness is matched roughly/);
    expect(r.notes.some((n) => /don't match their matrices/.test(n))).toBe(false);
  });

  it("reads which way the angles count from the dump's own matrices", () => {
    // the same scene from a Cinema 4D that counts heading the other way round
    const d = structuredClone(c4dTitle);
    for (const o of d.objects) (o.ml = matrix(o.pos, [-o.rot[0], o.rot[1], o.rot[2]])), (o.mg = o.ml);
    const flipped = importC4d(d);
    expect(flipped.doc.networks[2]!.nodes.find((n) => n.id === "title")!.params.rotation!.keys!.map((k) => k.v)).toEqual([[0, -30, 0], [0, 30, 0]]);
    expect(flipped.notes.some((n) => /don't match their matrices/.test(n))).toBe(false);
  });

  it("notices rotation values that don't fit the matrix, and other things it can't place", () => {
    const d = structuredClone(c4dTitle);
    d.objects[0]!.ml.v1 = [0, 0, 1]; // a matrix that isn't what HPB gives
    d.objects[1]!.tracks = [{ name: "Position . Y", channel: "position.y", keys: [{ t: 0, v: -260, interp: "linear", tl: 0, vl: 0, tr: 0, vr: 0 }, { t: 1, v: 0, interp: "linear", tl: 0, vl: 0, tr: 0, vr: 0 }] }];
    d.objects = d.objects.filter((o) => o.kind !== "camera");
    const n = importC4d(d).notes.join("\n");
    expect(n).toMatch(/rotation values don't match their matrices/);
    expect(n).toMatch(/"Floor": its parent is animated in Cinema 4D/);
    expect(n).toMatch(/no camera object/);
  });

  it("is deterministic, rejects other JSON and old dumps, and passes as a package", () => {
    expect(importC4d(structuredClone(c4dTitle))).toEqual(r);
    expect(() => importC4d({ objects: [] } as unknown as C4dDump)).toThrow(/isn't a Cinema 4D dump/);
    expect(() => importC4d({ ...c4dTitle, format: "mb-c4d-dump/0.1" })).toThrow(/export it again/);
    const p = checkPackage("title", { id: "title", name: "Turning title", category: "3d-type", dimension: "3d", description: "Extruded title turning.", grammar: { character: "smooth", structure: ["continuous"] }, source: { tool: "c4d", file: "Title.c4d", license: "Techonomy internal" }, status: "inbox" }, r.doc);
    expect(p.ok, p.ok ? "" : p.errors.join("\n")).toBe(true);
  });
});
