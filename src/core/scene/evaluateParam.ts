/**
 * Parameter stack evaluation: base value -> keyframes -> modifiers.
 * Pure and deterministic: the same param and time always give the same value.
 */
import { ease } from "../motion/eases";
import { isStaggerFrom, staggerDelaysMs } from "./delays";
import type { Key, Modifier, Param, Value } from "./schema";

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

function mix(a: Value, b: Value, p: number): Value {
  if (typeof a === "number" && typeof b === "number") return lerp(a, b, p);
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length)
    return a.map((x, i) => lerp(x, b[i]!, p)) as Value;
  if (typeof a === "string" && typeof b === "string" && /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b)) {
    const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return "#" + ca.map((x, i) => Math.round(lerp(x, cb[i]!, p)).toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  return p < 1 ? a : b; // text, booleans, choices: hold until the next key
}

/** Keyframed value at time t (seconds). Before the first key holds it; after the last key holds it. */
export function sampleKeys(keys: Key[], t: number): Value {
  const sorted = [...keys].sort((x, y) => x.t - y.t);
  const first = sorted[0]!;
  if (t <= first.t) return first.v;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!, b = sorted[i + 1]!;
    if (t < b.t) {
      const span = b.t - a.t;
      const p = span > 0 ? ease(a.ease)((t - a.t) / span) : 1;
      return mix(a.v, b.v, p);
    }
  }
  return sorted[sorted.length - 1]!.v;
}

/* Seeded value noise, smooth and deterministic (no Math.random). */
function hash(n: number, seed: number) {
  const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}
function noise1(x: number, seed: number) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed), hash(i + 1, seed), u);
}

const nParam = (m: Modifier, k: string, d: number) => (typeof m.params[k] === "number" ? (m.params[k] as number) : d);

function wave(m: Modifier, t: number) {
  const amp = nParam(m, "amplitude", 10), f = nParam(m, "frequency", 1), ph = (nParam(m, "phase", 0) * Math.PI) / 180;
  const x = t * f + ph / (2 * Math.PI);
  switch (m.params.shape) {
    case "triangle": return amp * (1 - 4 * Math.abs(Math.round(x - 0.25) - (x - 0.25)));
    case "square": return amp * (Math.sin(2 * Math.PI * x) >= 0 ? 1 : -1);
    case "saw": return amp * (2 * (x - Math.floor(x + 0.5)));
    default: return amp * Math.sin(2 * Math.PI * x);
  }
}

/**
 * Modifier output at time t; `part` lets per-part modifiers (noise seed, stagger) differ per character.
 * Undefined = no effect (stagger shifts time instead; an unresolved link or audio does nothing).
 */
function modifierValue(m: Modifier, t: number, part: number, ctx: EvalContext): Value | undefined {
  switch (m.type) {
    case "wave": return wave(m, t);
    case "noise": return nParam(m, "amplitude", 10) * noise1(t * nParam(m, "frequency", 1), nParam(m, "seed", 1) + part * 17);
    case "link": return linkValue(m, ctx.resolve?.(m));
    default: return undefined;
  }
}

/**
 * Link: the followed value × scale + offset, then clamped to min/max. Scale, offset, min and max
 * are numbers or per-axis [x, y] pairs.
 */
function linkValue(m: Modifier, src: Value | undefined): Value | undefined {
  if (typeof src !== "number" && !Array.isArray(src)) return undefined;
  const at = (k: string, i: number, d: number | undefined) => {
    const p = m.params[k];
    return typeof p === "number" ? p : Array.isArray(p) ? p[i] ?? d : d;
  };
  const one = (x: number, i: number) => {
    let y = x * at("scale", i, 1)! + at("offset", i, 0)!;
    const lo = at("min", i, undefined), hi = at("max", i, undefined);
    if (lo !== undefined) y = Math.max(lo, y);
    if (hi !== undefined) y = Math.min(hi, y);
    return y;
  };
  return typeof src === "number" ? one(src, 0) : (src.map(one) as Value);
}

function apply(v: Value, m: Modifier, d: Value): Value {
  const op = (x: number, dx: number) => (m.blend === "multiply" ? x * dx : m.blend === "replace" ? dx : x + dx);
  const dAt = (i: number) => (typeof d === "number" ? d : Array.isArray(d) ? d[i] ?? d[0] ?? 0 : 0);
  if (typeof v === "number") return op(v, dAt(0));
  if (Array.isArray(v)) {
    const axis = m.params.axis; // "x" | "y" | "z" | undefined (= all)
    return v.map((x, i) => (axis === undefined || ["x", "y", "z"][i] === axis ? op(x, dAt(i)) : x)) as Value;
  }
  return v;
}

export interface EvalContext {
  /** Index of the part (character, word, clone) being evaluated, and how many there are. */
  part?: number;
  parts?: number;
  /** Per-part time offset in seconds, from a stagger upstream. */
  timeOffset?: number;
  /** Supplied by the scene evaluator: the value a `link` modifier follows (another node's param). */
  resolve?: (m: Modifier) => Value | undefined;
}

/**
 * Time shift (s) a stagger modifier gives part `part` of `parts`: each (s), from, seed, ease, grid [cols, rows].
 * Same delays as the Phase node (v1 rig), so a staggered key and a staggered phase line up.
 */
function staggerOffset(m: Modifier, part: number, parts: number): number {
  const from = isStaggerFrom(m.params.from) ? m.params.from : "first";
  const grid = Array.isArray(m.params.grid) && m.params.grid.length === 2 ? (m.params.grid as [number, number]) : undefined;
  const easeName = typeof m.params.ease === "string" ? m.params.ease : undefined;
  const ms = staggerDelaysMs(nParam(m, "each", 0) * 1000, from, parts, { seed: nParam(m, "seed", 1), ease: easeName, grid });
  return (ms[part] ?? 0) / 1000;
}

export function evaluateParam(p: Param, t: number, ctx: EvalContext = {}): Value {
  const part = ctx.part ?? 0;
  let offset = ctx.timeOffset ?? 0;
  if (ctx.parts && ctx.parts > 1)
    for (const m of p.modifiers ?? []) if (m.enabled && m.type === "stagger") offset += staggerOffset(m, part, ctx.parts);
  const lt = t - offset;
  let v = p.keys && p.keys.length ? sampleKeys(p.keys, lt) : p.value;
  for (const m of p.modifiers ?? []) {
    if (!m.enabled) continue;
    const d = modifierValue(m, lt, part, ctx);
    if (d !== undefined) v = apply(v, m, d);
  }
  return v;
}
