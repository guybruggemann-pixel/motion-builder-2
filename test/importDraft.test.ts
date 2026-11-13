import { describe, expect, it } from "vitest";
import { applyDraft, buildDesignDoc, DRAFTS, guessRoles, lowerThird, validateDoc, type ImportDesign } from "@core/scene";

const design: ImportDesign = {
  name: "Card", width: 1920, height: 1080, source: "svg",
  layers: [
    { kind: "rect", name: "Bg", size: [1920, 1080], fill: "#101010", position: [0, 0] },
    { kind: "rect", name: "Panel", size: [600, 140], fill: "#1F4BFF", position: [100, 800] },
    { kind: "text", name: "Name", text: "Ada Lovelace", size: 56, weight: 700, fill: "#FFFFFF", position: [130, 870] },
    { kind: "text", name: "Job", text: "Engineer", size: 28, weight: 400, fill: "#FFFFFF", position: [130, 910] },
  ],
};

describe("Import and Draft", () => {
  it("tags roles: frame-filling shape is background, biggest text is title", () => {
    expect(guessRoles(design).map((l) => l.role)).toEqual(["background", "panel", "title", "subtitle"]);
  });
  it("an imported design is a valid doc with every layer", () => {
    const r = validateDoc(buildDesignDoc(design));
    expect(r.ok).toBe(true);
  });
  for (const c of ["smooth", "punchy", "playful"] as const)
    it(`${c} draft is valid and animates every layer in, back to front`, () => {
      const d = applyDraft(buildDesignDoc(design), c);
      expect(validateDoc(d).ok).toBe(true);
      const phases = d.networks[0]!.nodes.filter((n) => n.type === "Phase");
      expect(phases.map((p) => p.id)).toEqual(["l1-in", "l2-in", "l3-in", "l4-in"]);
      expect(phases[2]!.params.ease!.value).toBe(DRAFTS[c].ease);
    });
  it("re-drafting replaces the previous draft instead of stacking", () => {
    const d = applyDraft(applyDraft(buildDesignDoc(design), "playful"), "smooth");
    expect(d.networks[0]!.nodes.filter((n) => n.type === "Phase")).toHaveLength(4);
    expect(d.networks[0]!.nodes.some((n) => n.type === "Split")).toBe(false);
    expect(validateDoc(d).ok).toBe(true);
  });
  it("playful uses the Bouncy spring feel", () => {
    expect(DRAFTS.playful.ease).toBe("spring(0.600,628)");
  });
  it("drafts work on an existing project too", () => {
    expect(validateDoc(applyDraft(lowerThird, "punchy")).ok).toBe(true);
  });
});

import { applyDraftSpec, checkDraftSpec, checkReferenceLayers } from "@core/scene";

describe("AI drafts and reference rebuilds", () => {
  it("reference choreography preserves Techonomy's supplied design exactly", () => {
    const base = buildDesignDoc({ name: "Techonomy", width: 720, height: 900, source: "svg", layers: [
      { kind: "text", name: "Title", text: "techonomy", font: "Outfit", size: 80, weight: 700, fill: "#FFFFFF", position: [100, 300] },
      { kind: "text", name: "Subline", text: "is awesome", font: "Outfit", size: 60, weight: 400, fill: "#FFFFFF", position: [100, 450] },
    ] });
    const before = structuredClone(base);
    const doc = applyDraftSpec(base, checkDraftSpec({ motion: { enabled: false }, byLayer: [{ node: "l1", motion: { enabled: false }, tracks: [{ param: "position", keys: [{ t: 0, v: [100, 300], ease: "linear" }, { t: 2, v: [160, 300], ease: "linear" }, { t: 5, v: [100, 300], ease: "linear" }] }] }] }));
    expect(base).toEqual(before);
    expect(doc.networks[0]?.comp).toEqual(base.networks[0]?.comp);
    expect(doc.assets).toEqual(base.assets);
    for (const original of base.networks[0]?.nodes ?? []) {
      const layer = doc.networks[0]?.nodes.find((n) => n.id === original.id);
      for (const [param, stack] of Object.entries(original.params)) expect(layer?.params[param]?.value).toEqual(stack.value);
    }
    expect(doc.networks[0]?.nodes.filter((n) => n.type === "Phase")).toHaveLength(0);
    expect(doc.networks[0]?.nodes.find((n) => n.id === "l1")?.params.position?.keys?.[1]?.v).toEqual([160, 300]);
    expect(validateDoc(doc).ok).toBe(true);
  });
  it("per-layer start and exit generate editable phases at the requested times", () => {
    const doc = applyDraftSpec(buildDesignDoc(design), checkDraftSpec({ byLayer: [{ node: "l3", motion: { start: 1.2, duration: 0.4 }, out: { start: 0.2, duration: 0.3, offset: [100, 0] } }] }));
    expect(doc.networks[0]?.nodes.find((n) => n.id === "l3-in")?.params.start?.value).toBe(1.2);
    expect(doc.networks[0]?.nodes.find((n) => n.id === "l3-out")?.params).toMatchObject({ mode: { value: "out" }, start: { value: 0.2 }, duration: { value: 0.3 }, offsetPosition: { value: [100, 0] } });
    expect(validateDoc(doc).ok).toBe(true);
  });
  it("choreography rejects unknown targets, geometry rewrites and malformed track values", () => {
    const doc = applyDraftSpec(buildDesignDoc(design), checkDraftSpec({ byLayer: [{ node: "l3", tracks: [
      { param: "font", keys: [{ t: 0, v: "Anton" }, { t: 1, v: "Outfit" }] },
      { param: "position", keys: [{ t: 0, v: [1, 2, 3] }, { t: 1, v: [4, 5, 6] }] },
      { param: "opacity", keys: [{ t: -1, v: -20 }, { t: 100, v: 300 }] },
    ] }, { node: "missing", motion: { start: 1 } }] }));
    const title = doc.networks[0]?.nodes.find((n) => n.id === "l3");
    expect(title?.params.font?.value).toBe("Inter");
    expect(title?.params.position?.keys).toBeUndefined();
    expect(title?.params.opacity?.keys?.map((k) => [k.t, k.v])).toEqual([[0, 0], [5, 100]]);
    expect(validateDoc(doc).ok).toBe(true);
  });
  it("an AI draft keeps only known eases and clamps values", () => {
    const s = checkDraftSpec({ name: "Slam", gap: 9, motion: { ease: "superBounce", duration: 20, scale: 300, split: "letters" }, byRole: [{ role: "title", ease: "spring(0.6,628)", split: "characters" }, { role: "wizard", ease: "linear" }] });
    expect(s.motion.ease).toBe("outQuart");
    expect(s.motion.duration).toBe(4);
    expect(s.gap).toBe(2);
    expect(s.motion.split).toBe("none");
    expect(s.byRole?.title).toEqual({ ease: "spring(0.6,628)", split: "characters" });
    expect(Object.keys(s.byRole ?? {})).toEqual(["title"]);
  });
  it("an AI draft applies as a valid doc with the title split", () => {
    const d = applyDraftSpec(buildDesignDoc(design), checkDraftSpec({ motion: { ease: "outBack(1.7)" }, byRole: [{ role: "title", split: "characters" }] }));
    expect(validateDoc(d).ok).toBe(true);
    expect(d.networks[0]!.nodes.find((n) => n.id === "l3-split")?.params.by?.value).toBe("characters");
  });
  it("reference layers become text on its baseline and safe shapes", () => {
    const l = checkReferenceLayers([{ kind: "text", text: "Hi", x: 10, y: 100, size: 50, weight: 730, fill: "red" }, { kind: "rect", x: 0, y: 0, w: 50, h: 20, radius: 99, fill: "#1f4bff" }, { kind: "text", text: "" }], 1920, 1080);
    expect(l).toEqual([
      { kind: "text", name: "Text", text: "Hi", size: 50, weight: 700, fill: "#FFFFFF", position: [10, 140], role: undefined },
      { kind: "rect", name: "Shape", size: [50, 20], fill: "#1F4BFF", radius: 10, position: [0, 0], role: undefined },
    ]);
  });
});
