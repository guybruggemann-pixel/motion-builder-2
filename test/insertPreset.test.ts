/** Presets go into the open comp as a precomp (3D and 2D combine), and cloners move as one. */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { approxMeasure, evaluateFrame, lowerThird, title3d, uniqueGrid, validateDoc } from "@core/scene";
import { insertPreset } from "@/app/panels/insertPreset";
import { turnTarget } from "@/app/viewer/turn3d";

describe("adding a preset to a comp", () => {
  it("long preset names allocate distinct bounded ids without colliding", () => {
    const preset = { ...uniqueGrid, name: "Long preset ".repeat(30) };
    const doc = produce(lowerThird, (d) => { insertPreset(d, "main", preset); insertPreset(d, "main", preset); });
    expect(new Set(doc.networks.map((n) => n.id)).size).toBe(doc.networks.length);
    expect(doc.networks.every((n) => n.id.length <= 64)).toBe(true);
    expect(validateDoc(doc).ok).toBe(true);
  });
  it("adds the 3D title as a precomp next to the lower third, both drawing", () => {
    let id = "";
    const d = produce(lowerThird, (x) => void (id = insertPreset(x, "main", title3d)));
    const r = validateDoc(d);
    expect(r.ok, r.ok ? "" : r.errors.join("\n")).toBe(true);
    const main = d.networks.find((n) => n.id === "main")!;
    expect(main.nodes.find((n) => n.id === id)).toMatchObject({ type: "Subnet", name: "3D title" });
    const kinds = evaluateFrame(d, "main", 2, { measure: approxMeasure }).map((x) => x.kind);
    expect(kinds).toContain("scene3d");
    expect(kinds).toContain("text");
    // the preset's brand colours joined the kit; the project's own ones stay
    expect(d.brand!.colors.map((c) => c.token)).toEqual(expect.arrayContaining(["primary", "stone", "night"]));
  });

  it("can add the same preset twice", () => {
    const d = produce(lowerThird, (x) => {
      insertPreset(x, "main", uniqueGrid);
      insertPreset(x, "main", uniqueGrid);
    });
    expect(validateDoc(d).ok).toBe(true);
    expect(evaluateFrame(d, "main", 1, { measure: approxMeasure }).filter((x) => x.kind === "scene3d")).toHaveLength(2);
  });
});

describe("cloners move as one", () => {
  it("a Cloner is its own move / turn target", () => {
    const inner = uniqueGrid.networks[1]!;
    expect(turnTarget(uniqueGrid, inner, inner.nodes.find((n) => n.id === "cloner")!, 1)).toMatchObject({ node: "cloner", net: "grid-3d" });
  });

  it("a cloned object knows its Cloner (for picking the whole group)", () => {
    const s = evaluateFrame(uniqueGrid, "grid-3d", 1, { measure: approxMeasure })[0]!;
    expect(s.kind === "scene3d" && s.scene.objects[0]!.cloner?.node).toBe("cloner");
  });
});
