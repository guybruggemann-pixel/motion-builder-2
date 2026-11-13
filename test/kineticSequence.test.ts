import { describe, expect, it } from "vitest";
import { buildSequence, checkLowerThirdRecipe, checkSequenceRecipe, evaluateFrame, fitSize, grungeLowerThird, PROMO_SCENES, validateDoc } from "@core/scene";

const measure = (t: string, o: { size: number }) => t.length * o.size * 0.44;

describe("kinetic sequences", () => {
  const doc = buildSequence({ name: "t", width: 1080, height: 1080, scenes: PROMO_SCENES, transitionTime: 0.4 });
  it("lays scenes end to end, total = sum of scene lengths", () => {
    expect(validateDoc(doc).ok).toBe(true);
    const main = doc.networks.find((n) => n.id === "main")!;
    expect(main.comp!.duration).toBeCloseTo(PROMO_SCENES.reduce((a, s) => a + s.duration, 0), 5);
    const insts = main.nodes.filter((n) => n.type === "Subnet");
    expect(insts).toHaveLength(PROMO_SCENES.length);
    expect(insts[0]!.timing).toEqual({ in: 0, out: 1.5 });
  });
  it("a push keeps the old scene on during the transition and slides it out", () => {
    const main = doc.networks.find((n) => n.id === "main")!;
    const lines = main.nodes.filter((n) => n.type === "Subnet")[3]!; // lines, pushed out by the ticker
    expect(lines.timing!.out - lines.timing!.in).toBeCloseTo(1.5 + 0.4, 5);
    const keys = lines.params.position!.keys!;
    expect(keys[0]!.v).toEqual([1080, 0]);
    expect(keys.at(-1)!.v).toEqual([0, -1080]);
  });
  it("evaluates every scene without errors", () => {
    for (let t = 0; t < 9; t += 0.5) expect(evaluateFrame(doc, "main", t, { measure } as never).length).toBeGreaterThan(0);
    // mid-push from the line build into the ticker: both scenes draw
    const names = JSON.stringify(evaluateFrame(doc, "main", 5.8, { measure } as never));
    expect(names).toContain("FRONT");
    expect(names).toContain("TONIGHT");
  });
  it("fitSize fills the narrower side", () => {
    expect(fitSize(["LIVE"], 1000, 2000, 1)).toBe(Math.floor(1000 / (4 * 0.44)));
    expect(fitSize(["A", "B"], 5000, 1000, 1)).toBe(Math.floor(1000 / 1.73));
  });
});

describe("grunge lower thirds", () => {
  it("is valid, deterministic and promotes name and role", () => {
    const a = grungeLowerThird({ look: "tag" });
    expect(validateDoc(a).ok).toBe(true);
    expect(grungeLowerThird({ look: "tag" })).toEqual(a);
    expect(a.networks.find((n) => n.id === "grunge")!.promoted!.map((p) => p.id)).toEqual(["first", "last", "role"]);
  });
});

describe("rebuild recipes", () => {
  it("cleans a sequence answer", () => {
    const r = checkSequenceRecipe({ kind: "sequence", transitionTime: 9, scenes: [{ kind: "nope", text: "<b>HI</b>", color: "red", duration: 99, transition: "push-left" }, { kind: "ticker", text: "TONIGHT", transition: "push-up" }] })!;
    expect(r.transitionTime).toBe(1.5);
    expect(r.scenes[0]).toMatchObject({ kind: "caption", text: "bHIb", color: "#FFFFFF", duration: 6, transition: "cut" });
    expect(r.scenes[1]).toMatchObject({ kind: "ticker", transition: "push-up" });
    expect(checkSequenceRecipe({ kind: "none" })).toBeUndefined();
  });
  it("cleans a lower-third answer", () => {
    expect(checkLowerThirdRecipe({ kind: "lower-third", first: "caleb", look: "weird", colorA: "#ff00aa" })).toMatchObject({ first: "CALEB", look: "brush", colorA: "#FF00AA" });
    expect(checkLowerThirdRecipe({ kind: "none" })).toBeUndefined();
  });
});

describe("versus sequence (stack, jumble, versus)", () => {
  it("builds a valid 4 s doc with three scenes and accepts the new kinds from the AI", async () => {
    const { buildSequence, versusScenes, checkSequenceRecipe } = await import("@core/scene");
    const doc = buildSequence({ name: "V", width: 1080, height: 1080, scenes: versusScenes("TECHONOMY", "IS AWESOME"), transitionTime: 0.3 });
    expect(validateDoc(doc).ok).toBe(true);
    expect(doc.networks[0]!.comp!.duration).toBe(4);
    expect(doc.networks.filter((n) => n.id.startsWith("scene-"))).toHaveLength(3);
    const stack = doc.networks.find((n) => n.id === "scene-1")!;
    expect(stack.nodes.filter((n) => n.type === "Text")).toHaveLength(5);
    expect(stack.nodes.filter((n) => n.type === "Text" && n.params.strokeWidth)).toHaveLength(2);
    const jumble = doc.networks.find((n) => n.id === "scene-2")!;
    expect(jumble.nodes.filter((n) => n.type === "Text")).toHaveLength(9); // IS AWESOME without the space
    const r = checkSequenceRecipe({ kind: "sequence", scenes: [{ kind: "stack", text: "A" }, { kind: "jumble", text: "B" }, { kind: "versus", text: "A\nVS\nB" }] });
    expect(r!.scenes.map((s) => s.kind)).toEqual(["stack", "jumble", "versus"]);
  });
});
