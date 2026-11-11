import { describe, expect, it } from "vitest";
import { chainAfter, layerOrder, lowerThird, networkSpan, phaseRanges } from "@core/scene";

const inner = lowerThird.networks[1]!;

describe("graph helpers", () => {
  it("lists layers in paint order from the output", () => {
    const { wired, unwired } = layerOrder(inner);
    expect(wired.map((n) => n.id)).toEqual(["panel", "name", "title"]);
    expect(unwired).toEqual([]);
    expect(layerOrder(lowerThird.networks[0]!).wired.map((n) => n.id)).toEqual(["lt"]);
  });

  it("finds the Split/Phase chain acting on a layer", () => {
    expect(chainAfter(inner, "name").map((n) => n.id)).toEqual(["split", "name-in", "merge"]);
    expect(chainAfter(inner, "title").map((n) => n.id)).toEqual(["title-in", "merge"]);
  });

  it("knows how long a subnet runs", () => {
    expect(networkSpan(lowerThird, "main")).toBe(6);
    expect(networkSpan(lowerThird, "lower-third")).toBe(5);
    expect(networkSpan(lowerThird, "lower-third", { network: "main", node: "lt" })).toBe(5);
  });
});

describe("phase ranges", () => {
  it("gives each staggered part its start and end", () => {
    const r = phaseRanges(lowerThird, "lower-third", "name-in");
    expect(r.map((x) => [x.node, x.part])).toEqual([["name", 0], ["name", 1]]);
    expect(r[0]!.start).toBeCloseTo(0.25, 12);
    expect(r[0]!.end).toBeCloseTo(0.75, 12);
    expect(r[1]!.start).toBeCloseTo(0.31, 12);
    expect(r[1]!.end).toBeCloseTo(0.81, 12);
    expect(phaseRanges(lowerThird, "lower-third", "title-in").map((x) => [x.start, x.end])).toEqual([[0.45, 1.05]]);
    expect(phaseRanges(lowerThird, "lower-third", "panel")).toEqual([]);
  });

  it("anchors out phases to the layer's out point", () => {
    const d = structuredClone(lowerThird);
    const ph = d.networks[1]!.nodes.find((n) => n.id === "title-in")!;
    ph.params.mode = { value: "out" };
    const [r] = phaseRanges(d, "lower-third", "title-in");
    expect(r!.end).toBeCloseTo(5 - 0.45, 12);
    expect(r!.start).toBeCloseTo(5 - 0.45 - 0.6, 12);
  });
});
