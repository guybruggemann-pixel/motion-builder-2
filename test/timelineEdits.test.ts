import { describe, expect, it } from "vitest";
import { lowerThird, type Param } from "@core/scene";
import { createDocStore } from "@/store/docStore";
import { deleteKeys, dragLayer, moveKeys } from "@/timeline/edits";

const NET = "lower-third";
const store = () => createDocStore(lowerThird);
const node = (s: ReturnType<typeof store>, id: string) => s.getState().doc.networks[1]!.nodes.find((n) => n.id === id)!;
const keyTimes = (p: Param | undefined) => (p?.keys ?? []).map((k) => k.t);

describe("timeline edits", () => {
  it("moves keys and reports their new times", () => {
    const s = store();
    let refs: unknown;
    s.getState().edit("Move", (d) => void (refs = moveKeys(d, NET, [{ node: "panel", param: "size", t: 0.5 }], 0.2)));
    expect(keyTimes(node(s, "panel").params.size)).toEqual([0, 0.7]);
    expect(refs).toEqual([{ node: "panel", param: "size", t: 0.7 }]);
  });

  it("refuses to move a key below zero or onto a key that isn't moving", () => {
    const s = store();
    let r: unknown = "unset";
    s.getState().edit("Move", (d) => void (r = moveKeys(d, NET, [{ node: "panel", param: "size", t: 0 }], -0.1)));
    expect(r).toBeNull();
    s.getState().edit("Move", (d) => void (r = moveKeys(d, NET, [{ node: "panel", param: "size", t: 0 }], 0.5)));
    expect(r).toBeNull();
    expect(keyTimes(node(s, "panel").params.size)).toEqual([0, 0.5]);
    // both keys together is fine, and keeps them sorted
    s.getState().edit("Move", (d) => void moveKeys(d, NET, [{ node: "panel", param: "size", t: 0 }, { node: "panel", param: "size", t: 0.5 }], 1));
    expect(keyTimes(node(s, "panel").params.size)).toEqual([1, 1.5]);
  });

  it("deletes keys; the last one leaves its value behind", () => {
    const s = store();
    s.getState().edit("Delete", (d) => deleteKeys(d, NET, [{ node: "panel", param: "size", t: 0 }]));
    expect(keyTimes(node(s, "panel").params.size)).toEqual([0.5]);
    s.getState().edit("Delete", (d) => deleteKeys(d, NET, [{ node: "panel", param: "size", t: 0.5 }]));
    expect(node(s, "panel").params.size).toEqual({ value: [640, 120] });
  });

  it("moves a layer with its keys, trims without them", () => {
    const s = store();
    s.getState().edit("Move", (d) => dragLayer(d, NET, "panel", "move", 1, 5, 0.04));
    expect(node(s, "panel").timing).toEqual({ in: 1, out: 6 });
    expect(keyTimes(node(s, "panel").params.size)).toEqual([1, 1.5]);
    s.getState().edit("Trim", (d) => dragLayer(d, NET, "panel", "in", 0.5, 5, 0.04));
    expect(node(s, "panel").timing).toEqual({ in: 1.5, out: 6 });
    expect(keyTimes(node(s, "panel").params.size)).toEqual([1, 1.5]);
    s.getState().edit("Trim", (d) => dragLayer(d, NET, "panel", "out", -10, 5, 0.04));
    expect(node(s, "panel").timing!.out).toBeCloseTo(1.54, 9);
  });

  it("doesn't move a layer before zero", () => {
    const s = store();
    s.getState().edit("Move", (d) => dragLayer(d, NET, "panel", "move", -3, 5, 0.04));
    expect(node(s, "panel").timing).toEqual({ in: 0, out: 5 });
    expect(keyTimes(node(s, "panel").params.size)).toEqual([0, 0.5]);
  });
});
