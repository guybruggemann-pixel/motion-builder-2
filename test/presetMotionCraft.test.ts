import { describe, expect, it } from "vitest";
import { PRESETS, evaluateFrame, evaluateParam, buildSequence, floatingCards } from "@core/scene";
import type { Node } from "@core/scene";

const preset = (id: string) => {
  const p = PRESETS.find((p) => p.id === id);
  if (!p) throw new Error(`Missing preset ${id}`);
  return p.build();
};
const layer = (id: string, name: string): Node => {
  const n = preset(id).networks.flatMap((n) => n.nodes).find((n) => n.name === name);
  if (!n) throw new Error(`Missing layer ${name}`);
  return n;
};

describe("preset motion craft", () => {
  it("keeps flat backgrounds fully visible at frame zero", () => {
    const d = preset("brand-reveal");
    const bg = evaluateFrame(d, d.root, 0).find((x) => x.node === "l1");
    expect(bg?.opacity).toBe(1);
    expect(d.networks[0]?.nodes.some((n) => n.id === "l1-in")).toBe(false);
  });
  it("lets the last typewriter character arrive before the subtitle starts", () => {
    const d = preset("typewriter");
    const nodes = d.networks[0]?.nodes ?? [];
    const title = nodes.find((n) => n.name === "Line");
    const entrance = nodes.find((n) => n.id === `${title?.id}-in`);
    const sub = nodes.find((n) => n.name === "Sub");
    const subIn = nodes.find((n) => n.id === `${sub?.id}-in`);
    const ready = Number(entrance?.params.start?.value) + 0.05 + (String(title?.params.text?.value).length - 1) * 0.06;
    expect(Number(subIn?.params.start?.value)).toBeGreaterThan(ready);
  });
  it("preserves fading echo hierarchy on the text, not on its Phase", () => {
    expect(layer("echo-stack", "Echo 1").params.opacity?.value).toBe(24);
    expect(layer("echo-stack", "Echo 2").params.opacity?.value).toBe(62);
    const echoes = evaluateFrame(preset("echo-stack"), "main", 2);
    expect(echoes.filter((x) => x.kind === "text").map((x) => x.opacity)).toEqual([0.24, 0.62, 1, 0.62, 0.24]);
  });
  it("presses the button and label by the same amount at the same time", () => {
    const button = layer("cursor-click", "Button").params.scale;
    const label = layer("cursor-click", "Label").params.scale;
    if (!button || !label) throw new Error("Missing click scales");
    for (const t of [1.5, 1.55, 1.6, 1.8, 2.2]) expect(evaluateParam(label, t)).toEqual(evaluateParam(button, t));
    expect(evaluateParam(label, 1.6)).toEqual([94, 94]);
  });
  it("settles the gold flip within 1.05 seconds and holds its final pose", () => {
    const rotation = layer("gold-flip", "Title").params.rotation;
    if (!rotation) throw new Error("Missing rotation");
    expect(evaluateParam(rotation, 1.05)).toEqual([0, 0, 0]);
    expect(evaluateParam(rotation, 4)).toEqual([0, 0, 0]);
  });
  it.each(["chrome-spin", "glass-drift"])("%s returns to its first pose with matching seam speed", (id) => {
    const p = layer(id, "Title").params.rotation;
    if (!p) throw new Error("Missing rotation");
    expect(evaluateParam(p, 6)).toEqual(evaluateParam(p, 0));
    const a = evaluateParam(p, 0.001), b = evaluateParam(p, 5.999);
    if (!Array.isArray(a) || !Array.isArray(b)) throw new Error("Missing pose vectors");
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i] ?? Infinity, 4));
  });
  it("floating cards and labels keep shared transforms and periodic seam velocity", () => {
    const d = floatingCards();
    const nodes = d.networks[0]?.nodes ?? [];
    const card = nodes.find((n) => n.name === "Card 1");
    const label = nodes.find((n) => n.name === "Card 1 label");
    expect(label?.params.position).toEqual(card?.params.position);
    for (const n of nodes.filter((n) => n.type === "Shape")) {
      const p = n.params.position;
      if (!p) throw new Error("Missing position");
      const a = evaluateParam(p, 0), b = evaluateParam(p, 9);
      if (!Array.isArray(a) || !Array.isArray(b)) throw new Error("Missing position vectors");
      a.forEach((v, i) => expect(v).toBeCloseTo(b[i] ?? Infinity, 7));
      const step = 0.00001;
      const before = evaluateParam(p, 9 - step), after = evaluateParam(p, step);
      if (!Array.isArray(before) || !Array.isArray(after)) throw new Error("Missing samples");
      a.forEach((v, i) => expect(((after[i] ?? 0) - v) / step).toBeCloseTo(((b[i] ?? 0) - (before[i] ?? 0)) / step, 1));
    }
  });
  it("clamps transitions to short scenes and keeps both push distances matched", () => {
    const d = buildSequence({ name: "Short", width: 1080, height: 1080, transitionTime: 1.5, scenes: [
      { kind: "caption", text: "A", color: "#FFFFFF", background: "#000000", duration: 0.4, transition: "cut" },
      { kind: "caption", text: "B", color: "#FFFFFF", background: "#000000", duration: 0.4, transition: "push-left" },
    ] });
    const scenes = d.networks[0]?.nodes.filter((n) => n.type === "Subnet") ?? [];
    expect(scenes[0]?.timing?.out).toBe(0.8);
    expect(scenes[1]?.params.position?.keys?.at(-1)?.t).toBe(0.8);
    const a = scenes[0]?.params.position, b = scenes[1]?.params.position;
    if (!a || !b) throw new Error("Missing transition keys");
    const old = evaluateParam(a, 0.6), next = evaluateParam(b, 0.6);
    if (!Array.isArray(old) || !Array.isArray(next)) throw new Error("Missing transition positions");
    expect((next[0] ?? 0) - (old[0] ?? 0)).toBeCloseTo(1080);
  });
  it("classic lower thirds hold readable type then clear the frame", () => {
    const d = preset("lt-classic");
    expect(evaluateFrame(d, d.root, 3).filter((x) => x.kind === "text").every((x) => x.opacity === 1)).toBe(true);
    expect(evaluateFrame(d, d.root, 5).every((x) => x.opacity === 0)).toBe(true);
  });
  it("dot burst travels from the center to a radial destination", () => {
    const p = layer("dot-burst", "Dot 1").params.position;
    if (!p) throw new Error("Missing position");
    expect(evaluateParam(p, 0)).toEqual([925, 505]);
    expect(evaluateParam(p, 1)).toEqual([1225, 505]);
  });
});