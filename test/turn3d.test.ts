/**
 * Drag-to-turn: what a drag turns (an object, or from the comp a 3D scene's first object), the
 * angles it gives, and that it edits like the inspector (a key at the playhead on keyed rotation).
 */
import { describe, expect, it } from "vitest";
import { title3d } from "@core/scene";
import { createDocStore } from "@/store/docStore";
import { setValue } from "@/inspector/edits";
import { rotationAt, turned, turnTarget, TURN_DEG_PER_PX } from "@/viewer/turn3d";

const main = title3d.networks.find((n) => n.id === "main")!;
const inner = title3d.networks.find((n) => n.id === "title-3d")!;

describe("drag to turn", () => {
  it("turns a 3D object in its own network", () => {
    const word = inner.nodes.find((n) => n.id === "word")!;
    expect(turnTarget(title3d, inner, word, 2)).toEqual({ net: "title-3d", node: "word", name: "Title", t: 2 });
  });

  it("from the comp, a 3D scene layer turns its first object, in the scene's local time", () => {
    const d = structuredClone(title3d);
    const scene = d.networks.find((n) => n.id === "main")!.nodes.find((n) => n.id === "scene")!;
    scene.timing = { in: 1, out: 6 };
    expect(turnTarget(d, d.networks[0]!, scene, 3)).toMatchObject({ net: "title-3d", node: "word", t: 2 });
  });

  it("doesn't turn 2D layers, cameras or lights", () => {
    expect(turnTarget(title3d, main, main.nodes.find((n) => n.id === "label")!, 0)).toBeUndefined();
    expect(turnTarget(title3d, inner, inner.nodes.find((n) => n.id === "camera")!, 0)).toBeUndefined();
  });

  it("maps the drag to Y (left/right) and X (up/down); Shift keeps the larger axis", () => {
    expect(turned([0, 0, 5], 100, 0)).toEqual([0, 100 * TURN_DEG_PER_PX, 5]);
    expect(turned([0, 0, 0], 0, 50)).toEqual([50 * TURN_DEG_PER_PX, 0, 0]);
    expect(turned([0, 0, 0], 40, 10, true)).toEqual([0, 40 * TURN_DEG_PER_PX, 0]);
    expect(turned([0, 0, 0], 10, -40, true)).toEqual([-40 * TURN_DEG_PER_PX, 0, 0]);
  });

  it("starts from the keyed rotation at the playhead and adds a key there (AE rules), one undo step", () => {
    const s = createDocStore(title3d);
    const target = turnTarget(title3d, inner, inner.nodes.find((n) => n.id === "word")!, 3)!;
    const start = rotationAt(title3d, target);
    expect(start[0]).toBeCloseTo(0, 6); // halfway between [8,-35,0] and [-8,35,0]
    for (const dx of [10, 20, 30]) s.getState().edit("Turn Title", (d) => setValue(d, target.net, target.node, "rotation", turned(start, dx, 0), target.t, 0.02), { coalesce: "turn" });
    s.getState().commit();
    const keys = s.getState().doc.networks.find((n) => n.id === "title-3d")!.nodes.find((n) => n.id === "word")!.params.rotation!.keys!;
    expect(keys.map((k) => k.t)).toEqual([0, 3, 6]);
    expect((keys[1]!.v as number[])[1]).toBeCloseTo(start[1] + 30 * TURN_DEG_PER_PX, 6);
    expect(s.getState().past).toHaveLength(1);
  });
});
