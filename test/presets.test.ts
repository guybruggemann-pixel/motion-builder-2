import { describe, expect, it } from "vitest";
import { AMOUNT_EASES, ease as easeFn, easeChoice, easeString, MENU_EASES } from "@core/motion";

describe("ease menu", () => {
  it.each(MENU_EASES.flatMap((e) => [0, 13, 40, 100].map((amount) => [e, amount] as const)))(
    "%s amount %i survives a round trip through the ease string",
    (ease, amount) => {
      const s = easeString({ ease, amount, bezier: [0.3, 0.1, 0.2, 1] });
      const back = easeChoice(s);
      expect(back?.ease).toBe(ease);
      expect(easeString(back!)).toBe(s);

    },
  );

  it("reads amounts back as the slider value", () => {
    expect(easeChoice("outBack(1.600)")).toEqual({ ease: "outBack", amount: 40 });
    expect(easeChoice("outElastic(1,0.420)")).toEqual({ ease: "outElastic", amount: 40 });
    expect(easeChoice("spring(0.400,628)")).toEqual({ ease: "spring", amount: 40 });
    expect(easeChoice("cubicBezier(.2,0,0,1)")).toEqual({ ease: "custom", bezier: [0.2, 0, 0, 1] });
  });

  it.each([...AMOUNT_EASES])("bare %s keeps anime's default curve", (name) => {
    const back = easeString(easeChoice(name)!);
    for (let i = 0; i <= 20; i++) expect(easeFn(back)(i / 20)).toBeCloseTo(easeFn(name)(i / 20), 3);
  });

  it("leaves eases outside the menu alone", () => {
    expect(easeChoice("hold")).toBeUndefined();
    expect(easeChoice("steps(4)")).toBeUndefined();
    expect(easeChoice("inOutCirc")).toBeUndefined();
  });
});
