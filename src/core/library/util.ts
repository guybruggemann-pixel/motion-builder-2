/** Shared by the importers: ids, colours, rounding, font weights. */

export const slug = (s: string, fallback: string) => {
  const x = s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (/^[a-z]/.test(x) ? x : x ? `${fallback}-${x}` : fallback).slice(0, 48).replace(/-+$/, "");
};

/** Hands out ids that are unique within one network. */
export function ids() {
  const used = new Set<string>();
  return (wanted: string) => {
    let id = wanted, n = 2;
    while (used.has(id)) id = `${wanted}-${n++}`;
    used.add(id);
    return id;
  };
}

const hex2 = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, "0").toUpperCase();
/** Colour [r, g, b] 0..1 → #RRGGBB, with alpha only when it isn't opaque. */
export const hex = (c: unknown, alpha = 1): string => {
  const [r = 0, g = 0, b = 0] = Array.isArray(c) ? (c as number[]) : [];
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${alpha < 0.999 ? hex2(alpha) : ""}`;
};

export const r4 = (x: number) => Math.round(x * 1e4) / 1e4 || 0;

const WEIGHTS: [RegExp, number][] = [[/thin|hairline/, 100], [/extra-?light|ultra-?light/, 200], [/light/, 300], [/medium/, 500], [/semi-?bold|demi/, 600], [/extra-?bold|ultra-?bold/, 800], [/black|heavy/, 900], [/bold/, 700]];
/** Font weight from a style name ("SemiBold Italic" → 600); 400 when it says nothing. */
export const weightOf = (style: string): number => WEIGHTS.find(([re]) => re.test(style.toLowerCase()))?.[1] ?? 400;
