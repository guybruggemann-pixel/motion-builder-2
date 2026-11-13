import { describe, expect, it } from "vitest";
import { lowerThird } from "@core/scene";
import { checkProposal, motionContext, validEase } from "../src/app/ai/motionAi";

const net = lowerThird.networks.find((n) => n.nodes.some((x) => x.type === "Shape"))!;
const node = net.nodes.find((x) => x.type === "Shape")!;
const ctx = motionContext(net, node, 25, [0.5, 5.5]);

describe("AI motion proposals", () => {
  it("only offers animatable number/vector/colour params", () => {
    expect(ctx.params.map((p) => p.name)).toContain("position");
    expect(ctx.params.every((p) => ["number", "vec2", "vec3", "color"].includes(p.kind))).toBe(true);
  });
  it("clamps times into the layer, snaps to frames and replaces unknown eases", () => {
    const { tracks } = checkProposal({ summary: "", tracks: [{ param: "position", keys: [{ t: 0, v: [0, 0], ease: "wobble" }, { t: 1.013, v: [100, 0], ease: "outBack(1.7)" }] }] }, ctx);
    expect(tracks[0]!.keys).toEqual([{ t: 0.52, v: [0, 0], ease: "outCubic" }, { t: 1.0, v: [100, 0], ease: "outBack(1.7)" }]);
  });
  it("skips unknown params, wrong shapes and single keys", () => {
    const r = checkProposal({ summary: "", tracks: [{ param: "nope", keys: [] }, { param: "position", keys: [{ t: 1, v: 5, ease: "linear" }, { t: 2, v: [1, 2], ease: "linear" }] }] }, ctx);
    expect(r.tracks).toEqual([]);
    expect(r.skipped).toEqual(["nope", "position"]);
  });
  it("accepts the editor's ease vocabulary", () => {
    for (const e of ["outExpo", "spring(0.4,350)", "cubicBezier(.2,0,0,1)", "steps(4)", "hold"]) expect(validEase(e)).toBe(true);
    expect(validEase("easeInOutWobble")).toBe(false);
  });
});
