import { describe, expect, it } from "vitest";
import { ease } from "@core/motion";
import {
  evaluateFrame,
  evaluateParam,
  FrameCache,
  lowerThird,
  staggerDelaysMs,
  validateDoc,
  type Drawable,
  type Node,
  type Param,
  type SceneDoc,
  type TextDrawable,
} from "@core/scene";

const clone = (d: SceneDoc): SceneDoc => structuredClone(d);
const valid = (d: SceneDoc): SceneDoc => {
  const r = validateDoc(d);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.doc;
};
const byId = (f: Drawable[], id: string) => {
  const d = f.find((x) => x.id === id);
  if (!d) throw new Error(`no drawable ${id} in ${f.map((x) => x.id).join(", ")}`);
  return d;
};
const texts = (f: Drawable[]) => f.filter((d): d is TextDrawable => d.kind === "text");

/* approxMeasure: 0.6 em per glyph, 0.3 em per space. Name is 48 px, Inter 700. */
const EM = 48;
const LT_X = 120, LT_Y = 860; // Subnet position in main

describe("lower third reference", () => {
  const doc = valid(lowerThird);
  const at = (t: number) => evaluateFrame(doc, "main", t);

  it("is empty before the subnet's in point (t = 0)", () => {
    expect(at(0)).toEqual([]);
  });

  it("starts at t = 0.5: panel at zero width, name and title still hidden", () => {
    const f = at(0.5);
    expect(f.map((d) => d.id)).toEqual(["lt/panel#0", "lt/name#0", "lt/name#1", "lt/title#0"]);
    const panel = byId(f, "lt/panel#0");
    expect(panel.kind === "shape" && panel.size).toEqual([0, 120]);
    expect(panel.kind === "shape" && panel.fill).toBe("#1F4BFF"); // brand:primary
    expect(panel.matrix).toEqual([1, 0, 0, 1, LT_X, LT_Y]);
    for (const d of f.slice(1)) expect(d.opacity).toBe(0);
    // name words sit 30 px low behind a closed reveal
    expect(byId(f, "lt/name#0").matrix[5]).toBe(LT_Y + 56 + 30);
    expect(byId(f, "lt/name#0").clips[0]!.rect[3]).toBe(0);
  });

  it("at t = 1: panel open, words staggered 60 ms, title fading up with its wave", () => {
    const f = at(1); // local 0.5
    const panel = byId(f, "lt/panel#0");
    expect(panel.kind === "shape" && panel.size).toEqual([640, 120]);

    // word 0 starts at 0.25 s, word 1 at 0.31 s; 0.5 s duration, outExpo
    const e0 = ease("outExpo")((500 - 250) / 500);
    const e1 = ease("outExpo")((500 - 310) / 500);
    const [w0, w1] = [byId(f, "lt/name#0"), byId(f, "lt/name#1")] as TextDrawable[];
    expect(w0!.text).toBe("Guy");
    expect(w1!.text).toBe("Bruggemann");
    expect(w0!.matrix[4]).toBeCloseTo(LT_X + 32, 9);
    expect(w1!.matrix[4]).toBeCloseTo(LT_X + 32 + 3 * 0.6 * EM + 0.3 * EM, 9);
    expect(w0!.matrix[5]).toBeCloseTo(LT_Y + 56 + 30 * (1 - e0), 9);
    expect(w1!.matrix[5]).toBeCloseTo(LT_Y + 56 + 30 * (1 - e1), 9);
    expect(w0!.opacity).toBeCloseTo(e0, 12);
    expect(w1!.opacity).toBeCloseTo(e1, 12);
    expect(w1!.opacity).toBeLessThan(w0!.opacity);
    // reveal "up": the visible slice grows from the bottom of the word box
    const box = w0!.clips[0]!.rect;
    expect(box[3]).toBeCloseTo(EM * e0, 9);

    const title = byId(f, "lt/title#0");
    const et = ease("outQuart")((500 - 450) / 600);
    const breathe = (100 - 6 * Math.sin(2 * Math.PI * 0.5 * 0.5)) / 100;
    expect(title.opacity).toBeCloseTo(breathe * et, 12);
    expect(title.matrix[5]).toBeCloseTo(LT_Y + 96 + 16 * (1 - et), 9);
  });

  it("holds at rest at t = 3, with the title still breathing", () => {
    const f = at(3); // local 2.5
    for (const id of ["lt/name#0", "lt/name#1"]) {
      expect(byId(f, id).opacity).toBe(1);
      expect(byId(f, id).matrix[5]).toBe(LT_Y + 56);
      expect(byId(f, id).clips).toEqual([]); // finished reveal: no clip
    }
    expect(byId(f, "lt/title#0").opacity).toBeCloseTo((100 - 6 * Math.sin(2 * Math.PI * 0.5 * 2.5)) / 100, 12);
  });

  it("is gone at the subnet's out point (t = 5.5)", () => {
    expect(at(5.49).length).toBe(4);
    expect(at(5.5)).toEqual([]);
  });

  it("is deterministic", () => {
    expect(evaluateFrame(doc, "main", 1.234)).toEqual(evaluateFrame(doc, "main", 1.234));
  });

  it("evaluates the subnet on its own, in its own space", () => {
    const f = evaluateFrame(doc, "lower-third", 3);
    expect(byId(f, "panel#0").matrix).toEqual([1, 0, 0, 1, 0, 0]);
    expect(byId(f, "name#0").instance).toEqual([]);
  });
});

/* ---------- small docs ---------- */

const node = (n: Partial<Node> & Pick<Node, "id" | "type">): Node => ({ name: n.id, enabled: true, params: {}, ui: { x: 0, y: 0 }, ...n });

function textDoc(text: string, phase: Record<string, Param>, by = "words"): SceneDoc {
  return valid({
    version: 2,
    name: "t",
    root: "main",
    assets: [],
    networks: [
      {
        id: "main",
        name: "Main",
        comp: { width: 1920, height: 1080, fps: 25, duration: 5 },
        output: "out",
        nodes: [
          node({ id: "txt", type: "Text", params: { text: { value: text }, size: { value: 100 }, position: { value: [100, 500] } } }),
          node({ id: "split", type: "Split", params: { by: { value: by } } }),
          node({ id: "ph", type: "Phase", params: { duration: { value: 0.5 }, ease: { value: "linear" }, offsetOpacity: { value: 0 }, ...phase } }),
          node({ id: "out", type: "Output" }),
        ],
        wires: [
          { from: { node: "txt", port: "out" }, to: { node: "split", port: "in" } },
          { from: { node: "split", port: "out" }, to: { node: "ph", port: "in" } },
          { from: { node: "ph", port: "out" }, to: { node: "out", port: "in" } },
        ],
      },
    ],
  });
}

/** Parts (by text) that have started animating at time t. */
const started = (doc: SceneDoc, t: number) => texts(evaluateFrame(doc, "main", t)).filter((d) => d.opacity > 0).map((d) => d.text);

describe("Split", () => {
  it("cuts words and characters the way v1 lays them out", () => {
    const words = texts(evaluateFrame(textDoc("Hi yo", {}, "words"), "main", 3));
    expect(words.map((d) => [d.text, d.matrix[4]])).toEqual([["Hi", 100], ["yo", 100 + 120 + 30]]);
    const chars = texts(evaluateFrame(textDoc("Hi yo", {}, "characters"), "main", 3));
    expect(chars.map((d) => [d.text, d.matrix[4], d.part, d.parts])).toEqual([
      ["H", 100, 0, 4], ["i", 160, 1, 4], ["y", 250, 2, 4], ["o", 310, 3, 4],
    ]);
  });

  it("cuts lines on newlines, one baseline per line", () => {
    const lines = texts(evaluateFrame(textDoc("One\nTwo", {}, "lines"), "main", 3));
    expect(lines.map((d) => [d.text, d.matrix[5]])).toEqual([["One", 500], ["Two", 500 + 100 * 1.2]]);
  });
});

describe("stagger order", () => {
  it('"center" starts the middle word, then works outward', () => {
    const doc = textDoc("a b c d e", { stagger: { value: 0.1 }, from: { value: "center" } });
    expect(started(doc, 0.05)).toEqual(["c"]);
    expect(started(doc, 0.15)).toEqual(["b", "c", "d"]);
    expect(started(doc, 0.25)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it('"random" follows v1\'s seeded shuffle: a fixed, repeatable order', () => {
    const delays = staggerDelaysMs(100, "random", 5);
    expect([...delays].sort((a, b) => a - b)).toEqual([0, 100, 200, 300, 400]);
    const order = [0, 1, 2, 3, 4].sort((a, b) => delays[a]! - delays[b]!).map((i) => "abcde"[i]!);
    const doc = textDoc("a b c d e", { stagger: { value: 0.1 }, from: { value: "random" } });
    for (let k = 0; k < 5; k++) expect(started(doc, 0.05 + k * 0.1).sort()).toEqual(order.slice(0, k + 1).sort());
    // v1's ES3 core gives [300, 0, 400, 100, 200] for 5 parts, 100 ms, seed 1
    expect(delays).toEqual([300, 0, 400, 100, 200]);
    expect(order.join("")).toBe("bdeac");
  });

  it("a stagger modifier shifts each part's keys by the same delays", () => {
    const p: Param = {
      value: 0,
      keys: [{ t: 0, v: 0, ease: "linear" }, { t: 1, v: 100, ease: "linear" }],
      modifiers: [{ id: "s", type: "stagger", enabled: true, blend: "add", params: { each: 0.1 } }],
    };
    expect(evaluateParam(p, 0.6, { part: 0, parts: 3 })).toBeCloseTo(60, 9);
    expect(evaluateParam(p, 0.6, { part: 2, parts: 3 })).toBeCloseTo(40, 9);
  });
});

describe("subnet timing", () => {
  const doc = valid({
    version: 2,
    name: "sub",
    root: "main",
    assets: [],
    networks: [
      {
        id: "main",
        name: "Main",
        comp: { width: 1920, height: 1080, fps: 25, duration: 4 },
        output: "out",
        nodes: [
          node({ id: "sub", type: "Subnet", subnet: "inner", timing: { in: 1, out: 3 }, params: { position: { value: [10, 20] } } }),
          node({ id: "out", type: "Output" }),
        ],
        wires: [{ from: { node: "sub", port: "out" }, to: { node: "out", port: "in" } }],
      },
      {
        id: "inner",
        name: "Inner",
        output: "fade",
        nodes: [
          node({
            id: "box",
            type: "Shape",
            params: { position: { value: [0, 0], keys: [{ t: 0, v: [0, 0], ease: "linear" }, { t: 1, v: [100, 0], ease: "linear" }] } },
          }),
          node({ id: "fade", type: "Phase", params: { mode: { value: "out" }, duration: { value: 0.5 }, ease: { value: "linear" }, offsetOpacity: { value: 0 } } }),
        ],
        wires: [{ from: { node: "box", port: "out" }, to: { node: "fade", port: "in" } }],
      },
    ],
  });
  const at = (t: number) => evaluateFrame(doc, "main", t);

  it("runs the subnet on local time t - in", () => {
    expect(at(0.99)).toEqual([]);
    const box = byId(at(1.5), "sub/box#0");
    expect(box.matrix[4]).toBeCloseTo(10 + 50, 9);
    expect(box.matrix[5]).toBe(20);
  });

  it("anchors an out phase to the instance's out point", () => {
    expect(byId(at(2.4), "sub/box#0").opacity).toBe(1);
    expect(byId(at(2.75), "sub/box#0").opacity).toBeCloseTo(0.5, 12);
    expect(at(3)).toEqual([]);
  });
});

describe("promoted controls", () => {
  const withOverrides = (params: Record<string, Param>) => {
    const d = clone(lowerThird);
    Object.assign(d.networks[0]!.nodes.find((n) => n.id === "lt")!.params, params);
    return d;
  };

  it("override the text and colour inside the subnet instance", () => {
    const doc = valid(withOverrides({ name: { value: "Jane Doe" }, accent: { value: "brand:ink" } }));
    const f = evaluateFrame(doc, "main", 3);
    expect(texts(f).filter((d) => d.node === "name").map((d) => d.text)).toEqual(["Jane", "Doe"]);
    const panel = byId(f, "lt/panel#0");
    expect(panel.kind === "shape" && panel.fill).toBe("#0B0B0F");
    expect(texts(f).find((d) => d.node === "title")!.text).toBe("Motion designer"); // not overridden
  });

  it("take keys in the parent's time", () => {
    const doc = valid(withOverrides({ title: { value: "A", keys: [{ t: 0, v: "Before", ease: "hold" }, { t: 2, v: "After", ease: "hold" }] } }));
    expect(texts(evaluateFrame(doc, "main", 1.9)).find((d) => d.node === "title")!.text).toBe("Before");
    expect(texts(evaluateFrame(doc, "main", 2)).find((d) => d.node === "title")!.text).toBe("After");
  });

  it("are validated against the target param", () => {
    const r = validateDoc(withOverrides({ name: { value: 5 }, nope: { value: "x" } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("name: expected text"))).toBe(true);
      expect(r.errors.some((e) => e.includes('unknown param "nope"'))).toBe(true);
    }
  });

  it("rejects brand tokens missing from the kit", () => {
    const r = validateDoc(withOverrides({ accent: { value: "brand:nope" } }));
    expect(r.ok).toBe(false);
  });
});

describe("frame cache", () => {
  it("returns the same frame for the same doc and frame, and recomputes for a new doc", () => {
    const cache = new FrameCache();
    const a = cache.frame(lowerThird, "main", 25);
    expect(cache.frame(lowerThird, "main", 25)).toBe(a);
    expect(a).toEqual(evaluateFrame(lowerThird, "main", 1));
    const edited = clone(lowerThird);
    expect(cache.frame(edited, "main", 25)).not.toBe(a);
    expect(cache.frame(lowerThird, "main", 25.5)).toEqual(evaluateFrame(lowerThird, "main", 25.5 / 25));
  });
});
