import { describe, expect, it } from "vitest";
import { ease } from "@core/motion";
import { defaultParams, evaluateParam, lowerThird, sampleKeys, validateDoc, type Param, type SceneDoc } from "@core/scene";

const clone = (d: SceneDoc): SceneDoc => structuredClone(d);

describe("scene doc v2 validation", () => {
  it("accepts the lower third reference", () => {
    const r = validateDoc(lowerThird);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.ok).toBe(true);
  });

  it("rejects a missing subnet", () => {
    const d = clone(lowerThird);
    d.networks[0]!.nodes[0]!.subnet = "nope";
    const r = validateDoc(d);
    expect(r.ok).toBe(false);
  });

  it("rejects a subnet cycle", () => {
    const d = clone(lowerThird);
    d.networks[1]!.nodes.push({ id: "loop", type: "Subnet", name: "Loop", subnet: "main", enabled: true, params: {}, ui: { x: 0, y: 0 } });
    const r = validateDoc(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/cycle/);
  });

  it("rejects params outside the catalog, wrong kinds and keys on non-animatable params", () => {
    const d = clone(lowerThird);
    const name = d.networks[1]!.nodes.find((n) => n.id === "name")!;
    name.params.glow = { value: 3 };
    name.params.size = { value: "big" };
    name.params.weight = { value: 700, keys: [{ t: 0, v: 400, ease: "linear" }, { t: 1, v: 700, ease: "linear" }] };
    const r = validateDoc(d);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes('unknown param "glow"'))).toBe(true);
      expect(r.errors.some((e) => e.includes("size: expected number"))).toBe(true);
      expect(r.errors.some((e) => e.includes("not animatable"))).toBe(true);
    }
  });

  it("explains structural errors with a path and what is allowed", () => {
    const d = clone(lowerThird);
    const name = d.networks[1]!.nodes.find((n) => n.id === "name")!;
    (name.params.size as { value: unknown }).value = [1, 2, 3, 4];
    const r = validateDoc(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("networks.1.nodes.1.params.size.value: expected a number, [x, y], [x, y, z], a string or a boolean");
    expect(validateDoc(null)).toEqual({ ok: false, errors: [expect.stringMatching(/^doc: .*expected object/)] });
  });

  it("rejects non-finite numbers", () => {
    const d = clone(lowerThird);
    d.networks[0]!.comp!.duration = Infinity;
    expect(validateDoc(d).ok).toBe(false);
  });

  it("rejects wires that loop", () => {
    const d = clone(lowerThird);
    d.networks[1]!.wires.push({ from: { node: "name-in", port: "out" }, to: { node: "split", port: "in" } });
    const r = validateDoc(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/loop/);
  });

  it("rejects promoted controls that point at unknown params", () => {
    const d = clone(lowerThird);
    d.networks[1]!.promoted!.push({ id: "bad", label: "Bad", target: { node: "name", param: "nope" }, control: "text" });
    expect(validateDoc(d).ok).toBe(false);
  });

  it("builds default params from the catalog", () => {
    const p = defaultParams("Phase");
    expect(p.ease?.value).toBe("outExpo");
    expect(p.mode?.value).toBe("in");
  });
});

describe("parameter stack", () => {
  const size = lowerThird.networks[1]!.nodes.find((n) => n.id === "panel")!.params.size!;

  it("holds before the first key and after the last", () => {
    expect(evaluateParam(size, -1)).toEqual([0, 120]);
    expect(evaluateParam(size, 10)).toEqual([640, 120]);
  });

  it("eases between keys with the anime-ae ease of the starting key", () => {
    const v = evaluateParam(size, 0.25) as number[];
    expect(v[0]).toBeCloseTo(640 * ease("outExpo")(0.5), 9);
  });

  it("holds text and choices until the next key", () => {
    const keys = [{ t: 0, v: "Hello", ease: "linear" }, { t: 1, v: "World", ease: "linear" }];
    expect(sampleKeys(keys, 0.99)).toBe("Hello");
    expect(sampleKeys(keys, 1)).toBe("World");
  });

  it("interpolates hex colours", () => {
    expect(sampleKeys([{ t: 0, v: "#000000", ease: "linear" }, { t: 1, v: "#FFFFFF", ease: "linear" }], 0.5)).toBe("#808080");
  });

  it("adds modifiers on top of keys", () => {
    const p: Param = {
      value: 0,
      keys: [{ t: 0, v: 0, ease: "linear" }, { t: 1, v: 100, ease: "linear" }],
      modifiers: [{ id: "w", type: "wave", enabled: true, blend: "add", params: { amplitude: 10, frequency: 1 } }],
    };
    expect(evaluateParam(p, 0.25)).toBeCloseTo(25 + 10, 9);
    expect(evaluateParam(p, 0.5)).toBeCloseTo(50, 9);
  });

  it("is deterministic, including noise", () => {
    const p: Param = { value: 0, modifiers: [{ id: "n", type: "noise", enabled: true, blend: "add", params: { amplitude: 20, frequency: 3, seed: 4 } }] };
    const a = [0, 0.13, 0.5, 2.71].map((t) => evaluateParam(p, t, { part: 2 }));
    const b = [0, 0.13, 0.5, 2.71].map((t) => evaluateParam(p, t, { part: 2 }));
    expect(a).toEqual(b);
    expect(a.some((x) => x !== 0)).toBe(true);
  });

  it("shifts time per part for stagger", () => {
    expect(evaluateParam(size, 0.3, { timeOffset: 0.3 })).toEqual([0, 120]);
  });
});

describe("migration", () => {
  it("opens a v2 doc as v3 with no batches", () => {
    const v2 = { ...structuredClone(lowerThird), version: 2 } as Record<string, unknown>;
    delete v2.batches;
    const r = validateDoc(v2);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.doc.version).toBe(3);
    expect(r.doc.batches).toEqual([]);
  });

  it("rejects versions it doesn't know", () => {
    expect(validateDoc({ ...structuredClone(lowerThird), version: 1 }).ok).toBe(false);
    expect(validateDoc({ ...structuredClone(lowerThird), version: 9 }).ok).toBe(false);
  });
});
