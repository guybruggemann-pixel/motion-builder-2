import { ease, type EaseFn } from "./eases";

/**
 * The ease menu from Motion Builder v1, in its order. "custom" means a cubic bezier.
 * Kept as the UI vocabulary: designers know these names.
 */
export const MENU_EASES = [
  "linear", "outQuad", "outCubic", "outQuart", "outQuint", "outExpo", "outCirc", "outSine",
  "outBack", "outElastic", "spring", "outBounce",
  "inOutQuad", "inOutCubic", "inOutQuart", "inOutExpo", "inOutSine", "inOutBack",
  "inQuad", "inCubic", "inQuart", "inExpo", "inSine", "inCirc", "inBack", "custom",
] as const;
export type MenuEase = (typeof MENU_EASES)[number];

/** Eases where the "Overshoot / bounce" amount (0-100) changes the curve. */
export const AMOUNT_EASES: ReadonlySet<string> = new Set(["outBack", "outElastic", "spring", "inOutBack", "inBack"]);

export interface EaseChoice {
  ease: MenuEase;
  /** 0-100, default 40. Only used by AMOUNT_EASES. */
  amount?: number;
  /** Only used by "custom". */
  bezier?: [number, number, number, number];
}

/** Motion Builder v1 `easeString`: turns a menu choice into an anime-ae ease string. */
export function easeString(c: EaseChoice): string {
  const a = c.amount === undefined ? 40 : +c.amount;
  const name = c.ease;
  if (name === "outBack" || name === "inBack" || name === "inOutBack") return `${name}(${(a / 25).toFixed(3)})`;
  if (name === "outElastic") return `outElastic(1,${(0.6 - (0.45 * a) / 100).toFixed(3)})`;
  if (name === "spring") return `spring(${(a / 100).toFixed(3)},628)`;
  if (name === "custom") {
    const b = c.bezier ?? [0.2, 0, 0, 1];
    return `cubicBezier(${b.join(",")})`;
  }
  return name;
}

export const easeOf = (c: EaseChoice): EaseFn => ease(easeString(c));

/** Three motion characters used for AI drafts. Rules, not taste: they keep the options distinct. */
export const CHARACTERS = {
  smooth: { eases: ["outQuart", "inOutCubic", "outSine", "inOutSine"], durationMs: [600, 1200], staggerMs: [40, 90] },
  punchy: { eases: ["outExpo", "outQuint", "inExpo", "steps"], durationMs: [180, 450], staggerMs: [15, 40] },
  playful: { eases: ["spring", "outBack", "outElastic", "outBounce"], durationMs: [450, 900], staggerMs: [30, 70] },
} as const;
export type Character = keyof typeof CHARACTERS;

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Slider amounts equal to anime's defaults: back 1.7, elastic period 0.3, spring bounce 0.5. */
const BARE_AMOUNT: Record<string, number> = { outBack: 42.5, inBack: 42.5, inOutBack: 42.5, outElastic: 66.67, spring: 50 };

/**
 * Inverse of `easeString`: the menu choice an anime-ae ease string came from, so the UI can show
 * v1's ease names and amount slider. Undefined for strings outside the menu (e.g. "hold", "steps(4)").
 */
export function easeChoice(s: string): EaseChoice | undefined {
  const str = s.replace(/\s+/g, "");
  if ((MENU_EASES as readonly string[]).includes(str) && str !== "custom") {
    // A bare amount ease runs on anime's defaults; give the slider the amount that reproduces them.
    return AMOUNT_EASES.has(str) ? { ease: str as MenuEase, amount: BARE_AMOUNT[str] ?? 40 } : { ease: str as MenuEase };
  }
  let m = /^(outBack|inBack|inOutBack)\(([-\d.]+)\)$/.exec(str);
  if (m) return { ease: m[1] as MenuEase, amount: round2(+m[2]! * 25) };
  m = /^outElastic\(1,([-\d.]+)\)$/.exec(str);
  if (m) return { ease: "outElastic", amount: round2(((0.6 - +m[1]!) / 0.45) * 100) };
  m = /^spring\(([-\d.]+),628\)$/.exec(str);
  if (m) return { ease: "spring", amount: round2(+m[1]! * 100) };
  m = /^cubicBezier\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)$/.exec(str);
  if (m) return { ease: "custom", bezier: [+m[1]!, +m[2]!, +m[3]!, +m[4]!] };
  return undefined;
}
