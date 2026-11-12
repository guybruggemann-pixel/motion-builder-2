/**
 * Text layout and splitting, renderer-free. Widths come from a pluggable `MeasureText`
 * (the app passes canvas `measureText`, tests use `approxMeasure`).
 *
 * Conventions (match AE point text and Motion Builder v1):
 * - A run's origin is its baseline start; `y` is the baseline.
 * - Tracking is in px, added after every character (canvas `letterSpacing`).
 * - Lines break on newlines only; line `n` sits at baseline `n · size · leading`.
 * - Characters and words are laid out the way v1 does it: each unit measured on its own and
 *   advanced by its width, words separated by the width of one space.
 */

export interface FontSpec {
  family: string;
  weight: number;
  size: number;
}

/** Advance width of `text` in px, without tracking. Must be deterministic. */
export type MeasureText = (text: string, font: FontSpec) => number;

/** Deterministic stand-in for tests and Node: 0.6 em per glyph, 0.3 em per space. */
export const approxMeasure: MeasureText = (text, font) => {
  let w = 0;
  for (const ch of text) w += /\s/.test(ch) ? 0.3 : 0.6;
  return w * font.size;
};

/** Ascent and descent as a share of the font size, for part boxes, pivots and reveals. */
export const ASCENT = 0.8;
export const DESCENT = 0.2;
/** v1 pivot for split units: horizontal centre, 0.35 em above the baseline. */
export const PIVOT_RISE = 0.35;

export interface Run {
  text: string;
  /** Baseline start in layer space. */
  x: number;
  y: number;
  width: number;
  line: number;
}

export interface TextStyle {
  font: FontSpec;
  tracking: number;
  leading: number;
  align: "left" | "center" | "right";
  /** 0 = no limit. */
  maxWidth?: number;
  overflow?: "none" | "shrink" | "wrap";
}

const widthOf = (s: string, st: TextStyle, measure: MeasureText) =>
  s === "" ? 0 : measure(s, st.font) + st.tracking * [...s].length;

/** Greedy word wrap of one line to `max` px; a single word wider than `max` keeps its own line. */
function wrapLine(line: string, max: number, st: TextStyle, measure: MeasureText): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of line.split(" ")) {
    const next = cur === "" ? word : `${cur} ${word}`;
    if (cur !== "" && widthOf(next, st, measure) > max) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  out.push(cur);
  return out;
}

/**
 * The style after `overflow: "shrink"`: font size scaled down until the widest line fits maxWidth
 * (a few passes, since tracking doesn't scale with the size). Other styles come back unchanged.
 */
export function fitStyle(text: string, st: TextStyle, measure: MeasureText): TextStyle {
  if (st.overflow !== "shrink" || !st.maxWidth) return st;
  let style = st;
  for (let pass = 0; pass < 4; pass++) {
    const widest = Math.max(...text.split(/\r\n|\r|\n/).map((l) => widthOf(l, style, measure)));
    if (widest <= st.maxWidth + 0.01) break;
    style = { ...style, font: { ...style.font, size: style.font.size * (st.maxWidth / widest) } };
  }
  return style;
}

/** One run per line (after wrapping, if the style wraps), aligned around x = 0. */
export function layoutLines(text: string, st: TextStyle, measure: MeasureText): Run[] {
  const lineH = st.font.size * st.leading;
  const lines = text.split(/\r\n|\r|\n/);
  const wrapped = st.overflow === "wrap" && st.maxWidth ? lines.flatMap((l) => wrapLine(l, st.maxWidth!, st, measure)) : lines;
  return wrapped.map((line, i) => {
    const width = widthOf(line, st, measure);
    const x = st.align === "center" ? -width / 2 : st.align === "right" ? -width : 0;
    return { text: line, x, y: i * lineH, width, line: i };
  });
}

/** Split a run into words or characters. Spaces separate units and are not units themselves. */
export function splitRun(run: Run, by: "words" | "characters", st: TextStyle, measure: MeasureText): Run[] {
  const out: Run[] = [];
  const space = widthOf(" ", st, measure);
  let x = run.x;
  for (const word of run.text.split(" ")) {
    const ww = widthOf(word, st, measure);
    if (word !== "") {
      if (by === "words") out.push({ text: word, x, y: run.y, width: ww, line: run.line });
      else {
        let cx = x;
        for (const ch of word) {
          const cw = widthOf(ch, st, measure);
          if (!/\s/.test(ch)) out.push({ text: ch, x: cx, y: run.y, width: cw, line: run.line });
          cx += cw;
        }
      }
    }
    x += ww + space;
  }
  return out;
}

/** Box of a set of runs in layer space: [x, y, w, h], top-left origin. */
export function runsBox(runs: readonly Run[], size: number): [number, number, number, number] {
  if (!runs.length) return [0, 0, 0, 0];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of runs) {
    x0 = Math.min(x0, r.x);
    x1 = Math.max(x1, r.x + r.width);
    y0 = Math.min(y0, r.y - size * ASCENT);
    y1 = Math.max(y1, r.y + size * DESCENT);
  }
  return [x0, y0, x1 - x0, y1 - y0];
}
