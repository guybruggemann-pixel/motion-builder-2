/** Gizmo and drag maths: moving along a screen-projected axis, turning across it, values with keys. */
import { describe, expect, it } from "vitest";
import { lowerThird, title3d } from "@core/scene";
import { along, nudged, plus, turnAround, vecAt } from "@/viewer/manipulate";

describe("moving along an axis", () => {
  it("projects the drag onto the axis as it appears on screen", () => {
    // 100 world units cover 200 px to the right: a 50 px drag right is 25 units
    expect(along(50, 0, [200, 0], 100)).toBe(25);
    expect(along(0, 50, [200, 0], 100)).toBe(0); // across the axis: no move
    expect(along(-50, 0, [200, 0], 100)).toBe(-25);
    // a diagonal axis: only the part of the drag along it counts
    expect(along(30, 40, [60, 80], 100)).toBeCloseTo(50, 9);
  });

  it("doesn't move along an axis that points at the camera", () => {
    expect(along(100, 100, [1, 2], 100)).toBe(0);
  });
});

describe("turning around an axis", () => {
  it("turns with drags across the axis, 0.4° per px", () => {
    expect(turnAround(0, 100, [200, 0])).toBe(40); // X points right: drag down tips it
    expect(turnAround(100, 0, [200, 0])).toBe(0);
    expect(turnAround(-100, 0, [0, -200])).toBe(-40); // Y points up: drag across it
  });

  it("an axis pointing at the camera turns with horizontal drags", () => {
    expect(turnAround(50, 0, [0, 0])).toBe(20);
  });
});

describe("values", () => {
  it("reads vectors with keys applied, padded to the length asked", () => {
    const rot = vecAt(title3d, "title-3d", "word", "rotation", 0, 3);
    expect(rot).toEqual([8, -35, 0]);
    expect(vecAt(lowerThird, "main", "lt", "position", 1, 2)).toEqual([120, 860]);
    expect(vecAt(lowerThird, "main", "lt", "rotation", 1, 1)).toEqual([0]); // unset: the fallback
  });

  it("nudges one component and adds deltas, rounded to 0.01", () => {
    expect(nudged([1, 2, 3], 1, 0.123)).toEqual([1, 2.12, 3]);
    expect(plus([1, 2], [0.006, -1])).toEqual([1.01, 1]);
  });
});
