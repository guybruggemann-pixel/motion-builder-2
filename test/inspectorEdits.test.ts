import { describe, expect, it } from "vitest";
import { evaluateFrame, lowerThird, type TextDrawable } from "@core/scene";
import { createDocStore } from "@/store/docStore";
import { addModifier, removeModifier, resetParam, setComp, setKeyEase, setNodeProps, setValue, toggleKey, updateModifier } from "@/inspector/edits";

const NET = "lower-third";
const TOL = 0.02; // half a frame at 25 fps
const store = () => createDocStore(lowerThird);
const node = (s: ReturnType<typeof store>, id: string, net = 1) => s.getState().doc.networks[net]!.nodes.find((n) => n.id === id)!;

describe("inspector edits", () => {
  it("sets the base value on an unkeyed param, a key on a keyed one", () => {
    const s = store();
    expect(s.getState().edit("Size", (d) => setValue(d, NET, "name", "size", 52, 1, TOL))).toBe(true);
    expect(node(s, "name").params.size).toEqual({ value: 52 });

    s.getState().edit("Size", (d) => setValue(d, NET, "panel", "size", [600, 120], 0.5, TOL));
    expect(node(s, "panel").params.size!.keys!.map((k) => [k.t, k.v])).toEqual([[0, [0, 120]], [0.5, [600, 120]]]);

    // between keys: a new key, taking the ease of the key before it
    s.getState().edit("Size", (d) => setValue(d, NET, "panel", "size", [300, 120], 0.25, TOL));
    expect(node(s, "panel").params.size!.keys!.map((k) => [k.t, k.ease])).toEqual([[0, "outExpo"], [0.25, "outExpo"], [0.5, "linear"]]);
  });

  it("creates a param from the catalog default when the node doesn't carry it", () => {
    const s = store();
    s.getState().edit("Rotation", (d) => setValue(d, NET, "panel", "rotation", 15, 0, TOL));
    expect(node(s, "panel").params.rotation).toEqual({ value: 15 });
  });

  it("toggles a key at the playhead, keeping the value when the last one goes", () => {
    const s = store();
    s.getState().edit("Key", (d) => toggleKey(d, NET, "name", "position", 1, TOL, [32, 56]));
    expect(node(s, "name").params.position).toEqual({ value: [32, 56], keys: [{ t: 1, v: [32, 56], ease: "linear" }] });
    s.getState().edit("Key", (d) => toggleKey(d, NET, "name", "position", 1.01, TOL, [0, 0]));
    expect(node(s, "name").params.position).toEqual({ value: [32, 56] });
  });

  it("sets the ease of the key at the playhead", () => {
    const s = store();
    s.getState().edit("Ease", (d) => setKeyEase(d, NET, "panel", "size", 0.01, TOL, "outBack(1.600)"));
    expect(node(s, "panel").params.size!.keys![0]!.ease).toBe("outBack(1.600)");
  });

  it("adds, edits and removes modifiers", () => {
    const s = store();
    let id = "";
    s.getState().edit("Wave", (d) => void (id = addModifier(d, NET, "panel", "rotation", "wave")));
    expect(id).toBe("wave-1");
    s.getState().edit("Wave", (d) => updateModifier(d, NET, "panel", "rotation", id, { params: { amplitude: 4, axis: undefined }, blend: "multiply" }));
    const m = node(s, "panel").params.rotation!.modifiers![0]!;
    expect([m.blend, m.params.amplitude]).toEqual(["multiply", 4]);
    s.getState().edit("Wave", (d) => removeModifier(d, NET, "panel", "rotation", id));
    expect(node(s, "panel").params.rotation!.modifiers).toBeUndefined();
  });

  it("edits node props and comp settings", () => {
    const s = store();
    s.getState().edit("Props", (d) => setNodeProps(d, NET, "title", { name: "Job title", enabled: false, timing: { in: 1, out: 4 } }));
    expect([node(s, "title").name, node(s, "title").enabled, node(s, "title").timing]).toEqual(["Job title", false, { in: 1, out: 4 }]);
    s.getState().edit("Comp", (d) => setComp(d, "main", { duration: 8, background: "brand:ink" }));
    expect(s.getState().doc.networks[0]!.comp).toMatchObject({ duration: 8, background: "brand:ink" });
  });

  it("sets and resets a promoted control on the subnet instance", () => {
    const s = store();
    expect(s.getState().edit("Name", (d) => setValue(d, "main", "lt", "name", "Jane Doe", 0, TOL))).toBe(true);
    const words = evaluateFrame(s.getState().doc, "main", 3).filter((x): x is TextDrawable => x.kind === "text" && x.node === "name");
    expect(words.map((w) => w.text)).toEqual(["Jane", "Doe"]);
    s.getState().edit("Reset", (d) => resetParam(d, "main", "lt", "name"));
    expect(node(s, "lt", 0).params.name).toBeUndefined();
  });

  it("is rejected by validation when the value is the wrong kind", () => {
    const s = store();
    expect(s.getState().edit("Bad", (d) => setValue(d, NET, "name", "size", "big", 0, TOL))).toBe(false);
    expect(s.getState().edit("Bad", (d) => setValue(d, NET, "name", "fill", "brand:nope", 0, TOL))).toBe(false);
  });
});
