import { describe, expect, it } from "vitest";
import { bezierToEase, checkPackage, importAe, segmentBezier, buildIndex, type AeDump } from "../src/core/library";
import { approxMeasure, evaluateFrame, type Node, type ShapeDrawable, type TextDrawable } from "../src/core/scene";
import { aeLowerThird } from "./fixtures/aeLowerThird";

describe("After Effects eases", () => {
  it("turns speed and influence into the segment's cubic bezier", () => {
    // 0.5 s, 640 px: leaving at 8000 px/s over 16 %, arriving at rest over 70 %
    const b = segmentBezier(0.5, 640, { speed: 8000, influence: 16 }, { speed: 0, influence: 70 })!;
    expect(b.map((x) => Math.round(x * 1000) / 1000)).toEqual([0.16, 1, 0.3, 1]);
    expect(bezierToEase(b)).toBe("outExpo");
  });
  it("works for falling values and for no change", () => {
    const b = segmentBezier(1, -100, { speed: 0, influence: 33.3333 }, { speed: 0, influence: 33.3333 })!;
    expect(b[1]).toBeCloseTo(0);
    expect(b[3]).toBeCloseTo(1);
    expect(segmentBezier(1, 0, { speed: 0, influence: 33 }, { speed: 0, influence: 33 })).toBeUndefined();
  });
  it("names a curve only when it's close to a menu ease", () => {
    expect(bezierToEase([0.3333, 0, 0.6667, 1])).toBe("inOutSine"); // AE's Easy Ease
    expect(bezierToEase([0.9, 0.1, 0.2, 0.7])).toBe("cubicBezier(0.9,0.1,0.2,0.7)");
  });
});

describe("importing an After Effects dump", () => {
  const r = importAe(aeLowerThird);
  const net = (id: string) => r.doc.networks.find((n) => n.id === id)!;
  const node = (network: string, id: string): Node => net(network).nodes.find((n) => n.id === id)!;

  it("makes a main comp whose one Subnet is the asset", () => {
    expect(r.asset).toBe("lt-bar");
    expect(net("main").comp).toEqual({ width: 1920, height: 1080, fps: 25, duration: 4, motionBlur: { shutter: 180, samples: 8 } });
    expect(net("main").nodes.map((n) => [n.type, n.subnet])).toEqual([["Subnet", "lt-bar"], ["Output", undefined]]);
    expect(net("lt-bar").comp).toBeUndefined();
  });

  it("carries text, with [ctl] layers promoted", () => {
    const name = node("lt-bar", "name");
    expect(name).toMatchObject({ type: "Text", name: "Name", role: "title", timing: { in: 0.2, out: 4 } });
    expect(name.params).toMatchObject({ text: { value: "Guy Bruggemann" }, font: { value: "Inter" }, weight: { value: 700 }, size: { value: 48 }, fill: { value: "#FFFFFF" }, tracking: { value: 1.2 } });
    expect(r.controls).toEqual(["name", "bar"]);
    expect(net("lt-bar").promoted).toEqual([
      { id: "name", label: "Name", target: { node: "name", param: "text" }, control: "text" },
      { id: "bar", label: "Bar", target: { node: "bar", param: "fill" }, control: "color" },
    ]);
  });

  it("converts every key with its ease", () => {
    expect(node("lt-bar", "name").params.position!.keys).toEqual([{ t: 0.2, v: [32, 116], ease: "inOutSine" }, { t: 0.8, v: [32, 56], ease: "linear" }]);
    expect(node("lt-bar", "name").params.opacity!.keys).toEqual([{ t: 0.2, v: 0, ease: "linear" }, { t: 0.6, v: 100, ease: "linear" }]);
    expect(node("lt-bar", "bar").params.size!.keys).toEqual([{ t: 0, v: [0, 120], ease: "outExpo" }, { t: 0.5, v: [640, 120], ease: "linear" }]);
    expect(node("accent-dot", "dot").params.scale!.keys).toEqual([{ t: 0, v: [0, 0], ease: "hold" }, { t: 0.4, v: [0, 0], ease: "outExpo" }, { t: 0.8, v: [100, 100], ease: "linear" }]);
  });

  it("keeps a growing rectangle where After Effects draws it", () => {
    // AE centres the rect on [320, 60]; ours draws from its origin, so the anchor follows the size.
    expect(node("lt-bar", "bar").params.anchor!.keys).toEqual([{ t: 0, v: [-320, 0], ease: "outExpo" }, { t: 0.5, v: [0, 0], ease: "linear" }]);
    const bar = (t: number) => evaluateFrame(r.doc, "main", t, { measure: approxMeasure }).find((d) => d.node === "bar") as ShapeDrawable;
    const centre = (d: ShapeDrawable) => [d.matrix[4] + d.size[0] / 2, d.matrix[5] + d.size[1] / 2];
    expect(bar(0.5).size).toEqual([640, 120]);
    expect(centre(bar(0.5))).toEqual([120 + 320, 860 + 60]);
    expect(centre(bar(0.1)).map(Math.round)).toEqual([440, 920]);
    expect(bar(0.1).size[0]).toBeGreaterThan(320); // outExpo: most of the way after a fifth of the time
    expect(bar(2)).toMatchObject({ fill: "#1F4BFF", radius: 6 });
  });

  it("turns parenting into a Group that moves the children, and precomps into Subnets", () => {
    expect(node("lt-bar", "rig-rig")).toMatchObject({ type: "Group", params: { position: { value: [120, 860] } } });
    const into = (id: string) => net("lt-bar").wires.filter((w) => w.to.node === id).map((w) => w.from.node);
    expect(into("rig-rig")).toEqual(["accent", "bar", "name"]); // back to front
    expect(into("merge")).toEqual(["bg", "rig-rig"]);
    expect(node("lt-bar", "accent")).toMatchObject({ type: "Subnet", subnet: "accent-dot", timing: { in: 0.5, out: 4 }, params: { position: { value: [660, 60] }, anchor: { value: [100, 100] } } });
    const at = (t: number) => evaluateFrame(r.doc, "main", t, { measure: approxMeasure });
    const text = at(1).find((d) => d.kind === "text") as TextDrawable;
    expect([text.matrix[4], text.matrix[5]]).toEqual([152, 916]);
    // the dot's precomp starts at 0.5 s and the dot pops between 0.4 and 0.8 s of its own time
    const dot = (t: number) => at(t).find((d) => d.node === "dot") as ShapeDrawable | undefined;
    expect(Math.abs(dot(0.8)!.matrix[0])).toBe(0);
    expect(dot(1.3)!.matrix[0]).toBe(1);
    expect([dot(1.3)!.matrix[4] + 20, dot(1.3)!.matrix[5] + 20]).toEqual([120 + 660, 860 + 60]);
  });

  it("says what it couldn't carry over", () => {
    const has = (re: RegExp) => expect(r.notes.some((n) => re.test(n)), `${re} in\n${r.notes.join("\n")}`).toBe(true);
    has(/"Camera 1": camera layers aren't imported/);
    has(/"BG": effects aren't imported \(Gaussian Blur\)/);
    has(/"BG": blending mode "5216"/);
    has(/"BG" opacity: has an expression/);
    has(/"Name \[ctl\]": font "Inter-Bold" is imported as family "Inter", weight 700/);
    expect(node("lt-bar", "bg").params).toMatchObject({ opacity: { value: 50 }, fill: { value: "#0A0A0F" }, size: { value: [1920, 1080] } });
  });

  it("reports a swing between equal keys (seen in real After Effects: one speed set on both dimensions)", () => {
    const d = structuredClone(aeLowerThird);
    const size = d.comps[1]!.layers[2]!.properties[0]!.children![0]!.children![0]!.children![0]!.children![0]!;
    expect(size.matchName).toBe("ADBE Vector Rect Size");
    size.keys![0]!.easeOut![1] = { speed: 8000, influence: 16 }; // height stays 120 but leaves at 8000 px/s
    const n = importAe(d);
    expect(n.notes.some((x) => /"Bar \[ctl\]" › Rectangle 1 size: between two keys with the same value, After Effects swings/.test(x)), n.notes.join("\n")).toBe(true);
    expect(r.notes.some((x) => /swings away/.test(x))).toBe(false);
  });

  it("is deterministic and rejects other JSON", () => {
    expect(importAe(structuredClone(aeLowerThird))).toEqual(r);
    expect(() => importAe({ comps: [] } as unknown as AeDump)).toThrow(/isn't an After Effects dump/);
  });

  it("gives a doc that passes as a library package", () => {
    const meta = {
      id: "lt-bar", name: "Bar slide lower third", category: "lower-third", dimension: "2d", tags: ["bar"], description: "Bar grows, name slides up.",
      grammar: { character: "punchy", structure: ["enter", "hold"], timing: { enter: 0.8 }, eases: ["outExpo", "inOutSine"], techniques: ["bar-wipe"] },
      controls: r.controls, source: { tool: "ae", comp: "LT_bar", license: "Techonomy internal" }, status: "inbox", importNotes: r.notes,
    };
    const p = checkPackage("lt-bar", meta, r.doc);
    expect(p.ok, p.ok ? "" : p.errors.join("\n")).toBe(true);
    if (!p.ok) return;
    expect(p.package.asset.id).toBe("lt-bar");
    expect(buildIndex([p.package]).assets[0]).toMatchObject({ id: "lt-bar", category: "lower-third", grammar: { character: "punchy", duration: 4 }, controls: ["name", "bar"], status: "inbox" });
    expect(checkPackage("other", meta, r.doc)).toMatchObject({ ok: false, errors: [expect.stringMatching(/must be the folder name/)] });
    expect(checkPackage("lt-bar", { ...meta, controls: ["nope"], source: { tool: "ae", license: "" } }, r.doc).ok).toBe(false);
    const bad = checkPackage("lt-bar", { ...meta, controls: ["nope"] }, r.doc);
    expect(!bad.ok && bad.errors[0]).toMatch(/"nope" isn't a promoted control/);
  });
});
