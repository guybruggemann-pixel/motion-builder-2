import { describe, expect, it } from "vitest";
import { orbitOf, positionOf } from "@/app/viewer/camOrbit";
describe("camera orbit", () => {
  it("front camera is orbit 0, height 0", () => expect(orbitOf([0, 0, 2000], [0, 0, 0])).toEqual({ azimuth: 0, elevation: 0, distance: 2000 }));
  it("round-trips an angle", () => {
    const p = positionOf({ azimuth: -35, elevation: 18, distance: 1500 }, [0, 100, 0]);
    const o = orbitOf(p, [0, 100, 0]);
    expect(o.azimuth).toBeCloseTo(-35, 1); expect(o.elevation).toBeCloseTo(18, 1); expect(o.distance).toBeCloseTo(1500, 0);
  });
  it("90° height clamps to 89 so the camera never flips", () => expect(orbitOf(positionOf({ azimuth: 0, elevation: 120, distance: 1000 }, [0, 0, 0]), [0, 0, 0]).elevation).toBeCloseTo(89, 0));
});
