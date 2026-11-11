import { describe, expect, it } from "vitest";
import { lowerThird } from "@core/scene";
import { createDocStore } from "@/store/docStore";

const panelFill = (s: ReturnType<typeof createDocStore>) =>
  s.getState().doc.networks[1]!.nodes.find((n) => n.id === "panel")!.params.fill!.value;
const nameText = (s: ReturnType<typeof createDocStore>) =>
  s.getState().doc.networks[1]!.nodes.find((n) => n.id === "name")!.params.text!.value;

describe("doc store", () => {
  it("edits through immer, validates, and undoes/redoes with patches", () => {
    const s = createDocStore(lowerThird);
    const before = s.getState().doc;
    expect(s.getState().edit("Panel colour", (d) => void (d.networks[1]!.nodes.find((n) => n.id === "panel")!.params.fill!.value = "#FF0000"))).toBe(true);
    expect(panelFill(s)).toBe("#FF0000");
    expect(s.getState().doc).not.toBe(before);
    // untouched branches stay shared (cheap diffing and cache hits)
    expect(s.getState().doc.networks[0]).toBe(before.networks[0]);

    s.getState().undo();
    expect(panelFill(s)).toBe("brand:primary");
    s.getState().redo();
    expect(panelFill(s)).toBe("#FF0000");
  });

  it("rejects an edit that breaks validation and keeps the doc", () => {
    const s = createDocStore(lowerThird);
    const before = s.getState().doc;
    const ok = s.getState().edit("Bad", (d) => void (d.networks[1]!.nodes.find((n) => n.id === "name")!.params.size!.value = "huge"));
    expect(ok).toBe(false);
    expect(s.getState().doc).toBe(before);
    expect(s.getState().errors.join()).toMatch(/size: expected number/);
    expect(s.getState().past).toHaveLength(0);
  });

  it("collapses a coalesced run (a slider drag) into one undo step", () => {
    const s = createDocStore(lowerThird);
    for (const t of ["G", "Gu", "Guy"])
      s.getState().edit("Name", (d) => void (d.networks[1]!.nodes.find((n) => n.id === "name")!.params.text!.value = t), { coalesce: "name.text" });
    expect(s.getState().past).toHaveLength(1);
    s.getState().commit();
    s.getState().edit("Name", (d) => void (d.networks[1]!.nodes.find((n) => n.id === "name")!.params.text!.value = "Guy B"), { coalesce: "name.text" });
    expect(s.getState().past).toHaveLength(2);
    s.getState().undo();
    expect(nameText(s)).toBe("Guy");
    s.getState().undo();
    expect(nameText(s)).toBe("Guy Bruggemann");
  });

  it("clears redo on a new edit and history on load", () => {
    const s = createDocStore(lowerThird);
    s.getState().edit("A", (d) => void (d.name = "A"));
    s.getState().undo();
    expect(s.getState().future).toHaveLength(1);
    s.getState().edit("B", (d) => void (d.name = "B"));
    expect(s.getState().future).toHaveLength(0);
    expect(s.getState().load(lowerThird)).toBe(true);
    expect(s.getState().past).toHaveLength(0);
    expect(s.getState().load({ version: 1 })).toBe(false);
    expect(s.getState().doc.name).toBe(lowerThird.name);
  });

  it("freezes the doc", () => {
    const s = createDocStore(lowerThird);
    expect(Object.isFrozen(s.getState().doc.networks[1]!.nodes[0]!.params)).toBe(true);
  });
});
