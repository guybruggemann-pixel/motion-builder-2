import { describe, expect, it } from "vitest";
import { approxMeasure, evaluateFrame, lowerThirdFit, validateDoc, type Param, type SceneDoc, type ShapeDrawable, type TextDrawable } from "@core/scene";

const valid = (d: SceneDoc) => {
  const r = validateDoc(d);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.doc;
};
/** The template with a designer's Name set on the instance, as a sheet row would. */
const withName = (name: string) => {
  const d = structuredClone(lowerThirdFit);
  d.networks[0]!.nodes.find((n) => n.id === "lt")!.params.name = { value: name };
  return valid(d);
};
const frame = (d: SceneDoc, t = 3) => evaluateFrame(d, "main", t);
const panel = (f: ReturnType<typeof frame>) => f.find((x): x is ShapeDrawable => x.kind === "shape")!;
const nameRuns = (f: ReturnType<typeof frame>) => f.filter((x): x is TextDrawable => x.kind === "text" && x.node === "name");

describe("layout follows the text", () => {
  it("is a valid template", () => expect(validateDoc(lowerThirdFit).ok).toBe(true));

  it("sizes the panel to the name + 64 px padding, height unchanged", () => {
    for (const name of ["Jo Li", "Guy Bruggemann", "Maximiliaan van der Westhuizen"]) {
      const w = approxMeasure(name, { family: "Inter", weight: 700, size: 48 });
      expect(panel(frame(withName(name))).size).toEqual([Math.min(w, 900) + 64 > 160 ? Math.min(w, 900) + 64 : 160, 120]);
    }
  });

  it("keeps a minimum width for very short names", () => {
    expect(panel(frame(withName("Al"))).size).toEqual([160, 120]);
  });

  it("shrinks names wider than 900 px to fit", () => {
    const long = "Maximiliaan Alexander Christiaan van der Westhuizen-Brouwer";
    const f = frame(withName(long));
    const runs = nameRuns(f);
    expect(runs[0]!.font.size).toBeLessThan(48);
    const right = Math.max(...runs.map((r) => r.matrix[4] + approxMeasure(r.text, r.font))) - (120 + 32);
    expect(right).toBeLessThanOrEqual(900 + 0.01);
    expect(panel(f).size[0]).toBeCloseTo(900 + 64, 6);
  });

  it("wipes the panel on to its fitted width", () => {
    const d = withName("Guy Bruggemann");
    const mid = panel(frame(d, 0.5 + 0.1)); // 0.1 s into the wipe
    expect(mid.clips).toHaveLength(1);
    expect(mid.clips[0]!.rect[2]).toBeGreaterThan(0);
    expect(mid.clips[0]!.rect[2]).toBeLessThan(mid.size[0]);
    expect(panel(frame(d, 3)).clips).toEqual([]); // done: no clip
  });

  it("wraps onto more lines with overflow: wrap", () => {
    const d = structuredClone(lowerThirdFit);
    const name = d.networks[1]!.nodes.find((n) => n.id === "name")!;
    name.params.overflow = { value: "wrap" };
    name.params.maxWidth = { value: 300 };
    d.networks[0]!.nodes[0]!.params.name = { value: "Maximiliaan van der Westhuizen" };
    const lines = new Set(nameRuns(frame(valid(d))).map((r) => r.matrix[5]));
    expect(lines.size).toBeGreaterThan(1);
  });
});

describe("link modifier", () => {
  it("rejects links to missing nodes or unknown params", () => {
    const bad = (params: Record<string, string>) => {
      const d = structuredClone(lowerThirdFit);
      const size = d.networks[1]!.nodes.find((n) => n.id === "panel")!.params.size as Param;
      size.modifiers![0]!.params = { ...size.modifiers![0]!.params, ...params };
      return validateDoc(d).ok;
    };
    expect(bad({ node: "nope" })).toBe(false);
    expect(bad({ param: "nope" })).toBe(false);
    expect(bad({ param: "position" })).toBe(true);
  });

  it("stops a link loop instead of hanging", () => {
    const d = structuredClone(lowerThirdFit);
    const net = d.networks[1]!;
    const link = (to: string) => ({ value: 0, modifiers: [{ id: "l", type: "link" as const, enabled: true, blend: "add" as const, params: { node: to, param: "rotation" } }] });
    net.nodes.find((n) => n.id === "title")!.params.rotation = link("name");
    net.nodes.find((n) => n.id === "name")!.params.rotation = link("title");
    expect(() => frame(valid(d))).not.toThrow();
  });
});
