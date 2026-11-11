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
