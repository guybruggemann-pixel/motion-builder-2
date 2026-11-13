/**
 * AE export: the plan reproduces the doc within the baker's tolerances, and the generated .jsx,
 * run against a recording mock of AE's object model, builds the comps, layers and keys it says.
 * (A run in real After Effects is still the final check; see docs/plan.md, phase 2.)
 */
import { describe, expect, it } from "vitest";
import { approxMeasure, evaluateFrame, lowerThird, lowerThirdFit, title3d, type Drawable } from "@core/scene";
import { bake, type Baked } from "@/app/export/bake";
import { buildAePlan, postScriptName, type AePlan } from "@/app/export/aePlan";
import { aeScript, passesScript } from "@/app/export/exportAe";
import { planPasses } from "@/app/render/passes/plan";

/* ---------- a recording mock of the bits of AE's DOM the script uses ---------- */

class Prop {
  children: Prop[] = [];
  keys: { t: number; v: unknown; inType?: number; outType?: number; easeIn?: unknown[]; easeOut?: unknown[] }[] = [];
  value: unknown;
  name: string;
  dimensionsSeparated = false;
  constructor(public matchName: string, value?: unknown) {
    this.name = matchName;
    this.value = value ?? (matchName === "ADBE Scale" ? [100, 100, 100] : matchName === "ADBE Text Document" ? { resetCharStyle() {} } : 0);
  }
  property(n: string | number): Prop {
    if (typeof n === "number") return this.children[n - 1]!;
    let p = this.children.find((c) => c.matchName === n || c.name === n);
    if (!p) this.children.push((p = new Prop(n)));
    return p;
  }
  addProperty(m: string) {
    const p = new Prop(m);
    this.children.push(p);
    return p;
  }
  setValue(v: unknown) {
    this.value = v;
  }
  setValueAtTime(t: number, v: unknown) {
    this.keys.push({ t, v });
    this.keys.sort((a, b) => a.t - b.t);
  }
  setValuesAtTimes(ts: number[], vs: unknown[]) {
    ts.forEach((t, i) => this.setValueAtTime(t, vs[i]));
  }
  get numKeys() {
    return this.keys.length;
  }
  nearestKeyIndex(t: number) {
    let best = 0;
    this.keys.forEach((k, i) => Math.abs(k.t - t) < Math.abs(this.keys[best]!.t - t) && (best = i));
    return best + 1;
  }
  setInterpolationTypeAtKey(k: number, i: number, o: number) {
    Object.assign(this.keys[k - 1]!, { inType: i, outType: o });
  }
  setTemporalEaseAtKey(k: number, i: unknown[], o: unknown[]) {
    Object.assign(this.keys[k - 1]!, { easeIn: i, easeOut: o });
  }
}

class Layer extends Prop {
  startTime = 0;
  inPoint = 0;
  outPoint = 0;
  owner?: Layer[];
  /** AE: move this layer just below `other` (the layer list is top first). */
  moveAfter(other: Layer) {
    const a = this.owner!;
    a.splice(a.indexOf(this), 1);
    a.splice(a.indexOf(other) + 1, 0, this);
  }
  constructor(public kind: string, public source?: unknown) {
    super("layer");
  }
}

class Comp {
  layers: Layer[] & { addText?: unknown } = [];
  frameDuration: number;
  parentFolder: unknown;
  bgColor: unknown;
  constructor(public name: string, public width: number, public height: number, public pa: number, public duration: number, public frameRate: number) {
    this.frameDuration = 1 / frameRate;
    const add = (L: Layer) => (this.layers.unshift(L), (L.owner = this.layers), L); // AE puts a new layer on top
    Object.assign(this.layers, {
      addText: (s: string) => {
        const L = add(new Layer("text"));
        L.property("ADBE Text Properties").property("ADBE Text Document").value = { text: s, resetCharStyle() {} };
        return L;
      },
      addShape: () => add(new Layer("shape")),
      addNull: () => add(new Layer("null")),
      add: (item: unknown) => add(new Layer((item as { kind?: string })?.kind === "footage" ? "footage" : "precomp", item)),
    });
  }
  openInViewer() {}
}

function runInMockAe(jsx: string, files: string[] = []) {
  const comps: Comp[] = [];
  const imports: string[] = [];
  const app = {
    project: {
      importFile: (o: { file: { path: string } }) => (imports.push(o.file.path), { kind: "footage", path: o.file.path, parentFolder: undefined as unknown }),
      items: {
        addFolder: (n: string) => ({ name: n }),
        addComp: (...a: ConstructorParameters<typeof Comp>) => {
          const c = new Comp(...a);
          comps.push(c);
          return c;
        },
      },
    },
    beginUndoGroup() {},
    endUndoGroup() {},
  };
  class KeyframeEase {
    constructor(public speed: number, public influence: number) {}
  }
  class Shape {
    vertices: number[][] = [];
    closed = false;
  }
  class File {
    constructor(public path: string) {}
    get exists() {
      return files.some((f) => this.path.endsWith(`/${f}`));
    }
    get parent() {
      return { fsName: "/exports" };
    }
  }
  class ImportOptions {
    constructor(public file: File) {}
  }
  const globals = {
    app,
    File,
    ImportOptions,
    $: { fileName: "/exports/main.jsx" },
    KeyframeEase,
    Shape,
    KeyframeInterpolationType: { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 },
    ParagraphJustification: { LEFT_JUSTIFY: 7413, CENTER_JUSTIFY: 7415 },
    alert: (m: string) => {
      throw new Error(m);
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(...Object.keys(globals), jsx)(...Object.values(globals));
  return Object.assign(comps, { imports });
}

/* ---------- tests ---------- */

const plan: AePlan = buildAePlan(lowerThird, "main", approxMeasure);

describe("AE export plan", () => {
  it("keeps the comp structure: the lower third instance becomes a precomp", () => {
    expect(plan.comps.map((c) => c.name)).toEqual(["Lower third", "Main_v01"]);
    const main = plan.comps.at(-1)!;
    expect(main.layers).toHaveLength(1);
    expect(main.layers[0]).toMatchObject({ kind: "precomp", start: 0.5, in: 0.5 });
    expect(main.layers[0]!.out).toBeCloseTo(5.5, 9);
    expect(plan.comps[0]!.duration).toBe(5);
  });

  it("makes one layer per word of the split name, in paint order", () => {
    const names = plan.comps[0]!.layers.map((l) => l.name);
    expect(names).toEqual(["panel", "name 1 · Guy", "name 2 · Bruggemann", "title · Motion designer"]);
    expect(plan.comps[0]!.layers[1]!.text).toMatchObject({ font: "Inter-Bold", size: 48, fill: [1, 1, 1] });
  });

  it("bakes every channel within tolerance of the evaluator", () => {
    const inner = plan.comps[0]!;
    const ids = ["panel#0", "name#0", "name#1", "title#0"];
    const at = (t: number) => evaluateFrame(lowerThird, "lower-third", t, { flattenSubnets: false });
    const get = (id: string, t: number) => at(t).find((d) => d.id === id) as Drawable;
    const fns: Record<string, (d: Drawable) => number> = {
      x: (d) => d.matrix[4],
      y: (d) => d.matrix[5],
      op: (d) => d.opacity * 100,
    };
    const tol: Record<string, number> = { x: 0.25, y: 0.25, op: 0.3 };
    inner.layers.forEach((l, i) => {
      for (const c of ["x", "y", "op"] as const) {
        const ch = l.ch[c] as Baked;
        const err = bake().maxError((t) => fns[c]!(get(ids[i]!, t)), ch, l.in, l.out - 1 / inner.fps, inner.fps);
        expect(err, `${l.name}.${c}`).toBeLessThanOrEqual(tol[c]! * 1.5);
      }
    });
    // the name really animates (keys, not a constant), and the panel width grows
    expect("keys" in inner.layers[1]!.ch.y!).toBe(true);
    expect("keys" in inner.layers[0]!.ch.w!).toBe(true);
  });

  it("reproduces the reveal as a keyed mask on the name words", () => {
    const word = plan.comps[0]!.layers[1]!;
    expect(word.mask!.length).toBeGreaterThan(3);
    expect(word.mask![0]![4] - word.mask![0]![2]).toBeCloseTo(0, 6); // closed at the start
  });

  it("names fonts the way AE does", () => {
    expect(postScriptName("Inter", 400)).toBe("Inter-Regular");
    expect(postScriptName("Inter Tight", 650)).toBe("InterTight-Bold");
  });
});

describe("AE build script", () => {
  const comps = runInMockAe(aeScript(plan));

  it("builds the precomp first, then the main comp using it", () => {
    expect(comps.map((c) => c.name)).toEqual(["Lower third", "Main_v01"]);
    const main = comps[1]!;
    expect(main.layers).toHaveLength(1);
    expect(main.layers[0]!.source).toBe(comps[0]);
    expect(main.layers[0]!.startTime).toBe(0.5);
  });

  it("stacks layers like the doc paints them (title on top, panel at the bottom)", () => {
    expect(comps[0]!.layers.map((l) => l.name)).toEqual(["title · Motion designer", "name 2 · Bruggemann", "name 1 · Guy", "panel"]);
  });

  it("sets text, keys with AE eases, and masks", () => {
    const guy = comps[0]!.layers.find((l) => l.name === "name 1 · Guy")!;
    const doc = guy.property("ADBE Text Properties").property("ADBE Text Document").value as { font: string; fontSize: number; text: string };
    expect(doc).toMatchObject({ font: "Inter-Bold", fontSize: 48, text: "Guy" });
    const y = guy.property("ADBE Transform Group").property("ADBE Position_1");
    expect(y.keys.length).toBeGreaterThan(1);
    expect(y.keys.every((k) => k.easeIn && k.easeOut)).toBe(true);
    expect(guy.property("ADBE Transform Group").property("ADBE Position").dimensionsSeparated).toBe(true);
    expect(guy.property("ADBE Mask Parade").children).toHaveLength(1);
    // panel: rectangle sized and keyed, centred on half its size
    const panel = comps[0]!.layers.find((l) => l.name === "panel")!;
    const rect = panel.property("ADBE Root Vectors Group").children[0]!.property("ADBE Vectors Group").children[0]!;
    expect(rect.matchName).toBe("ADBE Vector Shape - Rect");
    const size = rect.property("ADBE Vector Rect Size").keys;
    expect(size.at(-1)!.v).toEqual([640, 120]);
    expect(rect.property("ADBE Vector Rect Position").keys.at(-1)!.v).toEqual([320, 60]);
  });

  it("escapes non-ASCII text for ExtendScript", () => {
    const d = structuredClone(lowerThirdFit);
    d.networks[0]!.nodes[0]!.params.name = { value: "Zoë Brüggemann" };
    const jsx = aeScript(buildAePlan(d, "main", approxMeasure));
    expect(/[^\x00-\x7f]/.test(jsx.slice(jsx.indexOf("var PLAN")))).toBe(false);
    expect(jsx).toContain("Zo\\u00eb");
  });
});

describe("AE export of 3D scene layers", () => {
  const plan3d = buildAePlan(title3d, "main", approxMeasure);

  it("plans the 3D layer as footage of a ProRes pass, the 2D label as native text", () => {
    const main = plan3d.comps.at(-1)!;
    expect(main.layers.map((l) => l.kind)).toEqual(["footage", "text", "text", "text"]);
    expect(main.layers[0]).toMatchObject({ name: "Title scene", footage: "Main_v01_Title_scene_3d.mov", start: 0 });
    expect(plan3d.passes).toEqual([{ file: "Main_v01_Title_scene_3d.mov", network: "title-3d", width: 1920, height: 1080, fps: 25, frames: 150 }]);
  });

  it("imports the pass from the script's folder and places it like the layer", () => {
    const comps = runInMockAe(aeScript(plan3d), ["Main_v01_Title_scene_3d.mov"]);
    expect(comps.imports).toEqual(["/exports/Main_v01_Title_scene_3d.mov"]);
    const scene = comps.at(-1)!.layers.find((l) => l.name === "Title scene")!;
    expect(scene.kind).toBe("footage");
    expect(scene.startTime).toBe(0);
  });

  it("says which passes are missing instead of failing silently", () => {
    expect(() => runInMockAe(aeScript(plan3d))).toThrow(/Main_v01_Title_scene_3d\.mov/);
  });
});

describe("AE passes assembly script", () => {
  const plan = planPasses(title3d, "main", { mattes: true, puzzle: true, depth: true });
  const files = plan.outputs.map((o) => o.file);

  it("puts the beauty layers in paint order and the rest in a hidden, shy Mattes precomp", () => {
    const comps = runInMockAe(passesScript(plan), files);
    expect(comps.map((c) => c.name)).toEqual(["Main_v01", "Main_v01 · Mattes"]);
    const [main, mattes] = comps as unknown as (Comp & { comment?: string })[];
    // AE stacks new layers on top: Mattes, then the label above the scene, the depth map hidden under the scene
    expect(main!.layers.map((l) => l.name)).toEqual(["Mattes", "Label", "Title scene", "Depth · Title scene"]);
    expect(main!.layers[0]).toMatchObject({ enabled: false, shy: true });
    expect(main!.layers.find((l) => l.name.startsWith("Depth"))).toMatchObject({ enabled: false, shy: true });
    expect(mattes!.layers.map((l) => l.name)).toContain("Matte · Title scene · Title");
    expect(main!.comment).toMatch(/R Label \/ G Title scene · Title/);
    expect(comps.imports).toHaveLength(files.length); // each pass imported once
  });

  it("names the passes that are missing", () => {
    expect(() => runInMockAe(passesScript(plan), files.slice(1))).toThrow(new RegExp(files[0]!.replace(/\./g, "\\.")));
  });
});
