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
  /** Spring only: perceived duration in ms (anime.js), default 628. Shorter = snappier. */
  duration?: number;
}

/** Motion Builder v1 `easeString`: turns a menu choice into an anime-ae ease string. */
export function easeString(c: EaseChoice): string {
  const a = c.amount === undefined ? 40 : +c.amount;
  const name = c.ease;
  if (name === "outBack" || name === "inBack" || name === "inOutBack") return `${name}(${(a / 25).toFixed(3)})`;
  if (name === "outElastic") return `outElastic(1,${(0.6 - (0.45 * a) / 100).toFixed(3)})`;
  if (name === "spring") return `spring(${(a / 100).toFixed(3)},${Math.round(c.duration ?? 628)})`;
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
  m = /^spring\(([-\d.]+),([\d.]+)\)$/.exec(str);
  if (m) return +m[2]! === 628 ? { ease: "spring", amount: round2(+m[1]! * 100) } : { ease: "spring", amount: round2(+m[1]! * 100), duration: +m[2]! };
  m = /^cubicBezier\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)$/.exec(str);
  if (m) return { ease: "custom", bezier: [+m[1]!, +m[2]!, +m[3]!, +m[4]!] };
  return undefined;
}

/** Named spring feels for the ease picker: bounce amount (0-100) and perceived duration (ms). */
export const SPRING_FEELS = [
  { name: "Gentle", amount: 15, duration: 900 },
  { name: "Smooth", amount: 30, duration: 628 },
  { name: "Snappy", amount: 25, duration: 350 },
  { name: "Bouncy", amount: 60, duration: 628 },
  { name: "Wobbly", amount: 80, duration: 1000 },
] as const;

/**
 * The Graph tab's preset grid, in groups. Every entry is a plain ease string the engine (and the AE
 * baker) already understands; the spring entries are exactly the SPRING_FEELS, so a tile and the
 * inspector's feel buttons produce the same curve.
 */
export const GRAPH_PRESETS: readonly { group: string; items: readonly { name: string; ease: string }[] }[] = [
  {
    group: "Ease out",
    items: [
      { name: "Soft", ease: "outSine" },
      { name: "Smooth", ease: "outCubic" },
      { name: "Strong", ease: "outQuart" },
      { name: "Sharp", ease: "outExpo" },
    ],
  },
  {
    group: "Ease in / out",
    items: [
      { name: "Gentle", ease: "inOutSine" },
      { name: "Even", ease: "inOutCubic" },
      { name: "Firm", ease: "inOutQuart" },
      { name: "Hard", ease: "inOutExpo" },
    ],
  },
  { group: "Springs", items: SPRING_FEELS.map((s) => ({ name: s.name, ease: easeString({ ease: "spring", amount: s.amount, duration: s.duration }) })) },
  {
    group: "Character",
    items: [
      { name: "Overshoot", ease: easeString({ ease: "outBack" }) },
      { name: "Elastic", ease: easeString({ ease: "outElastic" }) },
      { name: "Bounce", ease: "outBounce" },
      { name: "Linear", ease: "linear" },
      { name: "Anticipate", ease: easeString({ ease: "inBack" }) },
    ],
  },
];
