/*
 * anime-ae core, TypeScript port.
 * Easing math ported from anime.js v4.5 (MIT, Julian Garnier) via Motion Builder's ES3 core
 * (fixtures/anime-ae-core.es3.js). Behaviour must stay identical to that file: test/parity.test.ts
 * checks every ease against it. The ES3 file remains the After Effects runtime.
 */

export type EaseFn = ((t: number) => number) & { settlingDuration?: number };
export type EaseRef = string | EaseFn;

const PI = Math.PI;
const HALF_PI = PI / 2;
const TAU = PI * 2;
const MIN = 1e-11;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** Mirrors the ES3 `num`: undefined, null and '' fall back to the default; anything else is coerced. */
export const num = (v: unknown, d: number): number =>
  v === undefined || v === null || v === "" ? d : +(v as number);
export const linear: EaseFn = (t) => t;

const powerIn = (p?: unknown): EaseFn => {
  const e = num(p, 1.68);
  return (t) => Math.pow(t, e);
};

const IN: Record<string, EaseFn> = {
  Quad: powerIn(2),
  Cubic: powerIn(3),
  Quart: powerIn(4),
  Quint: powerIn(5),
  Sine: (t) => 1 - Math.cos(t * HALF_PI),
  Circ: (t) => 1 - Math.sqrt(1 - t * t),
  Expo: (t) => (t ? Math.pow(2, 10 * t - 10) : 0),
  Bounce: (t) => {
    let p2 = 0;
    let b = 4;
    while (t < ((p2 = Math.pow(2, --b)) - 1) / 11) {
      /* find the bounce segment */
    }
    return 1 / Math.pow(4, 3 - b) - 7.5625 * Math.pow((p2 * 3 - 2) / 22 - t, 2);
  },
};

const IN_PARAM: Record<string, (a?: unknown, b?: unknown) => EaseFn> = {
  "": (p) => powerIn(p),
  Back: (o) => {
    const s = num(o, 1.7);
    return (t) => (s + 1) * t * t * t - s * t * t;
  },
  Elastic: (amp, per) => {
    const a = clamp(num(amp, 1), 1, 10);
    const p = clamp(num(per, 0.3), MIN, 2);
    const s = (p / TAU) * Math.asin(1 / a);
    const e = TAU / p;
    return (t) => (t === 0 || t === 1 ? t : -a * Math.pow(2, -10 * (1 - t)) * Math.sin((1 - t - s) * e));
  },
};

type EaseType = "in" | "out" | "inOut" | "outIn";
const TYPES: Record<EaseType, (f: EaseFn) => EaseFn> = {
  in: (f) => (t) => f(t),
  out: (f) => (t) => 1 - f(1 - t),
  inOut: (f) => (t) => (t < 0.5 ? f(t * 2) / 2 : 1 - f(t * -2 + 2) / 2),
  outIn: (f) => (t) => (t < 0.5 ? (1 - f(1 - t * 2)) / 2 : (f(t * 2 - 1) + 1) / 2),
};

export function cubicBezier(x1?: unknown, y1?: unknown, x2?: unknown, y2?: unknown): EaseFn {
  const X1 = num(x1, 0.5), Y1 = num(y1, 0), X2 = num(x2, 0.5), Y2 = num(y2, 1);
  if (X1 === Y1 && X2 === Y2) return linear;
  const calc = (t: number, a1: number, a2: number) =>
    (((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t + 3 * a1) * t;
  return (x) => {
    if (x === 0 || x === 1) return x;
    let a = 0, b = 1, cx = 0, ct = 0, i = 0;
    do {
      ct = a + (b - a) / 2;
      cx = calc(ct, X1, X2) - x;
      if (cx > 0) b = ct;
      else a = ct;
    } while (Math.abs(cx) > 1e-7 && ++i < 100);
    return calc(ct, Y1, Y2);
  };
}

export function steps(n?: unknown, fromStart?: boolean): EaseFn {
  const N = num(n, 10);
  return (t) => {
    const v = clamp(t, 0, 1) * N;
    return (fromStart ? Math.ceil(v) : Math.floor(v)) / N;
  };
}

export interface SpringOptions {
  mass?: number;
  stiffness?: number;
  damping?: number;
  velocity?: number;
  /** Perceived mode (anime.js v4): bounce -1..1 and perceived duration in ms. */
  bounce?: number;
  duration?: number;
}

/** anime.js Spring, perceived-duration mode. `settlingDuration` (ms) is the tween length anime.js uses. */
export function spring(o: SpringOptions = {}): EaseFn {
  let m = num(o.mass, 1), s = num(o.stiffness, 100), d = num(o.damping, 10), v = num(o.velocity, 0);
  if (o.bounce !== undefined || o.duration !== undefined) {
    const bn = clamp(num(o.bounce, 0.5), -1, 1);
    const pds = num(o.duration, 628) / 1000;
    m = 1;
    v = 0;
    s = Math.pow(TAU / pds, 2);
    d = bn >= 0 ? ((1 - bn) * 4 * PI) / pds : (4 * PI) / (pds * (1 + bn));
    s = Math.round(clamp(s, MIN, 10000) * 1000) / 1000;
    d = Math.round(clamp(d, MIN, 300) * 1000) / 1000;
  }
  const w0 = clamp(Math.sqrt(s / m), MIN, 1000);
  const z = d / (2 * Math.sqrt(s * m));
  let wd: number, b: number;
  if (z < 1) {
    wd = w0 * Math.sqrt(1 - z * z);
    b = (z * w0 - v) / wd;
  } else if (z === 1) {
    wd = 0;
    b = -v + w0;
  } else {
    wd = w0 * Math.sqrt(z * z - 1);
    b = (z * w0 - v) / wd;
  }
  const solve = (t: number) => {
    let r: number;
    if (z < 1) r = Math.exp(-t * z * w0) * (Math.cos(wd * t) + b * Math.sin(wd * t));
    else if (z === 1) r = (1 + b * t) * Math.exp(-t * w0);
    else r = ((1 + b) * Math.exp((-z * w0 + wd) * t) + (1 - b) * Math.exp((-z * w0 - wd) * t)) / 2;
    return 1 - r;
  };
  let st = 0, rest = 0, it = 0, sd = 0;
  while (rest <= 10 && it <= 3000000) {
    if (Math.abs(1 - solve(st)) < 0.0005) rest++;
    else rest = 0;
    sd = st;
    st += 0.02;
    it++;
  }
  const f: EaseFn = (t) => (t === 0 || t === 1 ? t : solve(t * sd));
  f.settlingDuration = Math.round(sd * 1000);
  return f;
}

const hold: EaseFn = () => 0;
const cache = new Map<string, EaseFn>();

/**
 * Parse an ease string: "outExpo", "outElastic(1,.5)", "inBack(2)", "cubicBezier(.2,0,0,1)",
 * "steps(5)", "spring(.5,628)", "linear", "hold". Unknown names fall back to linear (as in ES3).
 */
export function ease(name?: EaseRef | null): EaseFn {
  if (typeof name === "function") return name;
  if (!name || name === "linear" || name === "none") return linear;
  if (name === "hold") return hold;
  const hit = cache.get(name);
  if (hit) return hit;
  const str = String(name).replace(/\s+/g, "");
  let args: string[] = [];
  let base = str;
  const p = str.indexOf("(");
  if (p !== -1) {
    base = str.slice(0, p);
    args = str.slice(p + 1, -1).split(",");
  }
  let fn: EaseFn | null = null;
  if (base === "cubicBezier") fn = cubicBezier(args[0], args[1], args[2], args[3]);
  else if (base === "steps") fn = steps(args[0], args[1] === "true" || args[1] === "1");
  else if (base === "spring") fn = spring({ bounce: num(args[0], 0.5), duration: num(args[1], 628) });
  else {
    const types: EaseType[] = ["inOut", "outIn", "in", "out"];
    for (let i = 0; i < types.length && !fn; i++) {
      const ty = types[i]!;
      if (base.indexOf(ty) === 0) {
        const key = base.slice(ty.length);
        const plain = IN[key];
        const param = IN_PARAM[key];
        if (plain) fn = TYPES[ty](plain);
        else if (param) fn = TYPES[ty](param(args[0], args[1]));
      }
    }
  }
  if (!fn) fn = linear;
  cache.set(name, fn);
  return fn;
}

/** The 40 type x family names anime.js exposes, in the ES3 core's order. */
export const EASE_NAMES: string[] = (() => {
  const ty = ["in", "out", "inOut", "outIn"];
  const k = ["Quad", "Cubic", "Quart", "Quint", "Sine", "Circ", "Expo", "Back", "Elastic", "Bounce"];
  const out: string[] = [];
  for (const fam of k) for (const t of ty) out.push(t + fam);
  return out;
})();
