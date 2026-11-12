/**
 * Selection-driven UI: hit testing and boxes in the viewer come from the evaluated drawables, and
 * "Designers can edit" promotes a layer's content controls on its asset (and stays valid).
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { approxMeasure, evaluateFrame, lowerThird, validateDoc, type Mat } from "@core/scene";
import { boxOf, hitTest, ownerIn } from "@/render/bounds";
import { isDesignerEditable, setDesignerEditable } from "@/inspector/edits";

const view: Mat = [0.5, 0, 0, 0.5, 10, 20];

describe("viewer hit testing", () => {
  const inner = evaluateFrame(lowerThird, "lower-third", 3, { measure: approxMeasure });
  const flat = evaluateFrame(lowerThird, "main", 3, { measure: approxMeasure });

  it("finds the topmost drawable under a point, and nothing on empty stage", () => {
    const name = inner.find((d) => d.node === "name")!;
    const box = boxOf([name], view, approxMeasure)!;
    const hit = hitTest(inner, view, approxMeasure, box.x + box.w / 2, box.y + box.h / 2);
    expect(hit?.node).toBe("name"); // the name sits on top of the panel
    expect(hitTest(inner, view, approxMeasure, 5, 5)).toBeUndefined();
  });

  it("maps flattened subnet contents to the instance in the shown network", () => {
    const d = flat.find((x) => x.node === "name")!;
    expect(ownerIn("main", d)).toBe(d.instance[0]);
    expect(lowerThird.networks.find((n) => n.id === "main")!.nodes.some((n) => n.id === d.instance[0])).toBe(true);
  });

  it("boxes a whole instance around all of its parts", () => {
    const inst = flat.filter((d) => ownerIn("main", d) === flat[0]!.instance[0]);
    const all = boxOf(inst, view, approxMeasure)!;
    for (const d of inst) {
      const b = boxOf([d], view, approxMeasure);
      if (!b) continue;
      expect(b.x).toBeGreaterThanOrEqual(all.x - 1e-9);
      expect(b.y + b.h).toBeLessThanOrEqual(all.y + all.h + 1e-9);
    }
  });
});

describe("designers can edit", () => {
  it("promotes a layer's content on the asset and removes it again, staying valid", () => {
    const net = "lower-third";
    const off = produce(lowerThird, (d) => setDesignerEditable(d, net, "name", false));
    expect(isDesignerEditable(off.networks.find((n) => n.id === net)!, "name")).toBe(false);
    expect(validateDoc(off).ok).toBe(true);
    const on = produce(off, (d) => setDesignerEditable(d, net, "name", true));
    const p = on.networks.find((n) => n.id === net)!.promoted!;
    expect(p.find((c) => c.target.node === "name")).toMatchObject({ target: { param: "text" }, control: "text" });
    expect(validateDoc(on).ok).toBe(true);
    // turning it on twice doesn't duplicate
    const twice = produce(on, (d) => setDesignerEditable(d, net, "name", true));
    expect(twice.networks.find((n) => n.id === net)!.promoted!.filter((c) => c.target.node === "name")).toHaveLength(1);
  });

  it("promotes a shape's colour", () => {
    const off = produce(lowerThird, (d) => setDesignerEditable(d, "lower-third", "panel", false));
    const on = produce(off, (d) => setDesignerEditable(d, "lower-third", "panel", true));
    expect(on.networks.find((n) => n.id === "lower-third")!.promoted!.find((c) => c.target.node === "panel")).toMatchObject({ target: { param: "fill" }, control: "color" });
    expect(validateDoc(on).ok).toBe(true);
  });
});
