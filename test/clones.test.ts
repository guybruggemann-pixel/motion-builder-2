/** Cloners, effectors and fields (roadmap 3D-b): pure maths, and the evaluated "UNIQUE" grid. */
import { describe, expect, it } from "vitest";
import { applyEffector, approxMeasure, cloneRandom, evaluateFrame, fieldWeight, makeClones, uniqueGrid, validateDoc, type Clone, type EffectorSpec, type FieldSpec, type Scene3DDrawable, type SceneDoc } from "@core/scene";

const grid = (over: Partial<Parameters<typeof makeClones>[0]> = {}) =>
  makeClones({ mode: "grid", count: [3, 2, 1], spacing: [100, 50, 0], step: [0, 0, 0], stepRotation: [0, 0, 0], radius: 0, plane: "xy", align: false, rowSlide: 0, ...over });

describe("cloners", () => {
  it("lays a grid out centred, rows from the top", () => {
    const c = grid();
    expect(c).toHaveLength(6);
    expect(c[0]!.position).toEqual([-100, 25, 0]);
    expect(c[5]!.position).toEqual([100, -25, 0]);
  });

  it("slides odd and even rows in opposite directions", () => {
    const c = grid({ rowSlide: 30 });
    expect(c[0]!.position[0]).toBe(-130); // row 0
    expect(c[3]!.position[0]).toBe(-70); // row 1
  });

  it("makes lines and circles", () => {
    const lin = makeClones({ mode: "linear", count: [3, 1, 1], spacing: [0, 0, 0], step: [10, 0, 0], stepRotation: [0, 15, 0], radius: 0, plane: "xy", align: false, rowSlide: 0 });
    expect(lin.map((c) => c.position[0])).toEqual([-10, 0, 10]);
    expect(lin[2]!.rotation).toEqual([0, 30, 0]);
    const rad = makeClones({ mode: "radial", count: [4, 1, 1], spacing: [0, 0, 0], step: [0, 0, 0], stepRotation: [0, 0, 0], radius: 100, plane: "xy", align: true, rowSlide: 0 });
    expect(rad[1]!.position[0]).toBeCloseTo(0, 9);
    expect(rad[1]!.position[1]).toBeCloseTo(100, 9);
    expect(rad[1]!.rotation[2]).toBeCloseTo(90, 9);
  });
});

describe("seeded randomness and fields", () => {
  it("is deterministic per (seed, index), in 0..1, and varies", () => {
    expect(cloneRandom(7, 3)).toBe(cloneRandom(7, 3));
    const xs = Array.from({ length: 50 }, (_, i) => cloneRandom(7, i));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(new Set(xs.map((x) => x.toFixed(3))).size).toBeGreaterThan(40);
  });

  it("weighs clones: linear ramp, sphere with soft edge, noise in range", () => {
    const lin: FieldSpec = { kind: "linear", position: [0, 0, 0], axis: 0, sign: 1, length: 100, invert: false };
    expect(fieldWeight(lin, [-50, 0, 0])).toBe(0);
    expect(fieldWeight(lin, [0, 0, 0])).toBe(0.5);
    expect(fieldWeight(lin, [80, 0, 0])).toBe(1);
    const sph: FieldSpec & { kind: "spherical" } = { kind: "spherical", position: [0, 0, 0], radius: 100, falloff: 0.5, invert: false };
    expect(fieldWeight(sph, [10, 0, 0])).toBe(1);
    expect(fieldWeight(sph, [200, 0, 0])).toBe(0);
    expect(fieldWeight({ ...sph, invert: true }, [200, 0, 0])).toBe(1);
    const noise: FieldSpec = { kind: "noise", scale: 100, speed: 1, seed: 3, t: 0.5, invert: false };
    const w = fieldWeight(noise, [37, 12, 5]);
    expect(w).toBeGreaterThanOrEqual(0);
    expect(w).toBeLessThanOrEqual(1);
    expect(fieldWeight(noise, [37, 12, 5])).toBe(w);
  });
});

describe("effectors", () => {
  const base: Clone[] = grid();

  it("Random picks palette colours deterministically; strength 0 changes nothing", () => {
    const e: EffectorSpec = { kind: "random", position: [10, 0, 0], rotation: [0, 0, 0], scale: 0, palette: ["#111111", "#222222"], seed: 4, strength: 1 };
    const a = applyEffector(base, e, () => 1);
    expect(a.every((c) => c.color === "#111111" || c.color === "#222222")).toBe(true);
    expect(applyEffector(base, e, () => 1)).toEqual(a);
    expect(applyEffector(base, { ...e, strength: 0 }, () => 1)).toEqual(base);
  });

  it("Step ramps from the first clone to the last; a field weight scales it", () => {
    const e: EffectorSpec = { kind: "step", position: [0, 0, 0], rotation: [0, 90, 0], scale: 0, strength: 1 };
    const s = applyEffector(base, e, () => 1);
    expect(s[0]!.rotation[1]).toBe(0);
    expect(s[5]!.rotation[1]).toBe(90);
    expect(applyEffector(base, e, () => 0.5)[5]!.rotation[1]).toBe(45);
  });
});

describe("the UNIQUE grid", () => {
  const scene = (t: number, d: SceneDoc = uniqueGrid) => (evaluateFrame(d, "main", t, { measure: approxMeasure }).find((x) => x.kind === "scene3d") as Scene3DDrawable).scene;

  it("validates, and draws the word as 75 coloured clones", () => {
    const r = validateDoc(uniqueGrid);
    expect(r.ok, r.ok ? "" : r.errors.join("\n")).toBe(true);
    const o = scene(1).objects[0]!;
    expect(o.clones).toHaveLength(75);
    const colours = new Set(o.clones!.map((c) => c.color));
    expect(colours.size).toBeGreaterThan(3);
    expect([...colours].every((c) => /^#[0-9A-F]{6}$/i.test(c ?? ""))).toBe(true);
  });

  it("rows slide over time; same time, same frame", () => {
    expect(scene(2).objects[0]!.clones![0]!.matrix).not.toEqual(scene(0).objects[0]!.clones![0]!.matrix);
    expect(scene(2.4)).toEqual(scene(2.4));
  });

  it("a disabled cloner draws the word once again", () => {
    const d = structuredClone(uniqueGrid);
    d.networks[1]!.nodes.find((n) => n.id === "cloner")!.enabled = false;
    expect(scene(1, d).objects[0]!.clones).toBeUndefined();
  });

  it("only fields go into a field input", () => {
    const d = structuredClone(uniqueGrid);
    d.networks[1]!.wires.push({ from: { node: "camera", port: "out" }, to: { node: "random", port: "field" } });
    expect(validateDoc(d).ok).toBe(false);
  });
});

describe("Reveal effector", () => {
  const withReveal = () => {
    const d = structuredClone(uniqueGrid);
    const net = d.networks[1]!;
    net.nodes.push({ id: "reveal", type: "Reveal", name: "Reveal", enabled: true, params: { duration: { value: 0.5 }, stagger: { value: 0.05 }, offsetScale: { value: 0 } }, ui: { x: 0, y: 0 } });
    net.wires = net.wires.filter((w) => !(w.from.node === "random" && w.to.node === "merge"));
    net.wires.push({ from: { node: "random", port: "out" }, to: { node: "reveal", port: "in" } }, { from: { node: "reveal", port: "out" }, to: { node: "merge", port: "in" } });
    return d;
  };
  const scaleOf = (m: number[]) => Math.hypot(m[0]!, m[1]!, m[2]!);
  const clones = (d: SceneDoc, t: number) => (evaluateFrame(d, "main", t, { measure: approxMeasure }).find((x) => x.kind === "scene3d") as Scene3DDrawable).scene.objects[0]!.clones!;

  it("brings clones in one after another: first ones settled while later ones are still on their way", () => {
    const d = withReveal();
    expect(validateDoc(d).ok).toBe(true);
    const early = clones(d, 0.6); // clone 0 arrived (0.5 s), clone 40 starts at 2 s
    const settled = clones(d, 5.9);
    expect(scaleOf(early[0]!.matrix)).toBeCloseTo(scaleOf(settled[0]!.matrix), 6);
    expect(scaleOf(early[40]!.matrix)).toBeCloseTo(0, 6); // still at 0 % scale
  });
});

describe("cloners on 2D layers", () => {
  const doc2d = (): SceneDoc => {
    const d = structuredClone(uniqueGrid);
    d.networks = [
      {
        id: "main",
        name: "Main",
        comp: { width: 1920, height: 1080, fps: 25, duration: 4 },
        output: "out",
        nodes: [
          { id: "t", type: "Text", name: "Word", enabled: true, params: { text: { value: "Hi" }, position: { value: [100, 200] } }, ui: { x: 0, y: 0 } },
          { id: "c", type: "Cloner", name: "Row", enabled: true, params: { mode: { value: "linear" }, count: { value: [3, 1, 1] }, step: { value: [300, 0, 0] } }, ui: { x: 0, y: 0 } },
          { id: "r", type: "Random", name: "Colours", enabled: true, params: { palette: { value: "#111111, #222222" } }, ui: { x: 0, y: 0 } },
          { id: "out", type: "Output", name: "Output", enabled: true, params: {}, ui: { x: 0, y: 0 } },
        ],
        wires: [
          { from: { node: "t", port: "out" }, to: { node: "c", port: "in" } },
          { from: { node: "c", port: "out" }, to: { node: "r", port: "in" } },
          { from: { node: "r", port: "out" }, to: { node: "out", port: "in" } },
        ],
      },
    ];
    return d;
  };

  it("copies the layer per clone, offset in px, with palette fills and part numbers for a Phase", () => {
    const d = doc2d();
    expect(validateDoc(d).ok).toBe(true);
    const ds = evaluateFrame(d, "main", 1, { measure: approxMeasure });
    expect(ds).toHaveLength(3);
    expect(ds.map((x) => x.matrix[4])).toEqual([-200, 100, 400]);
    expect(ds.map((x) => x.part)).toEqual([0, 1, 2]);
    expect(ds.every((x) => x.kind === "text" && ["#111111", "#222222"].includes(x.fill))).toBe(true);
  });
});
