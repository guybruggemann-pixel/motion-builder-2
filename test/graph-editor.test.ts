import { describe, expect, it } from "vitest";
import { ease, MENU_EASES } from "@core/motion";
import { BEZIER_OF, bezierOf } from "@/app/timeline/GraphEditor";

describe("graph editor bezier stand-ins", () => {
  it.each(MENU_EASES.filter((e) => BEZIER_OF[e] && !["outBack", "inBack", "inOutBack", "outCirc", "inCirc"].includes(e)))(
    "%s is close to its menu ease",
    (name) => {
      const b = ease(`cubicBezier(${BEZIER_OF[name]!.join(",")})`), e = ease(name);
      let worst = 0;
      for (let i = 0; i <= 50; i++) worst = Math.max(worst, Math.abs(b(i / 50) - e(i / 50)));
      expect(worst).toBeLessThan(0.08);
    },
  );

  it("reads a custom ease back as its own bezier", () => {
    expect(bezierOf("cubicBezier(0.2,0,0,1)")).toEqual([0.2, 0, 0, 1]);
    expect(bezierOf("outExpo")).toEqual(BEZIER_OF.outExpo);
    expect(bezierOf("hold")).toBeUndefined();
  });
});
