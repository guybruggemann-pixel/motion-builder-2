/**
 * Cloners, effectors and fields (Cinema 4D style), as pure maths on clone records. A Cloner makes
 * clones of its input object (grid, linear, radial); effectors change them (Random, Plain, Step),
 * scaled by a field's weight at each clone (Linear, Spherical, Noise) and the effector's strength.
 * Deterministic: randomness is Park-Miller seeded per (seed, clone index), noise is seeded.
 */
import { apply4, mul4, objectMatrix, type Mat4 } from "./scene3d";
import { phaseProgress, type PhaseSpec } from "./phase";

export interface Clone {
  index: number;
  /** In the cloner's space. */
  position: [number, number, number];
  rotation: [number, number, number];
  /** Percent per axis. */
  scale: [number, number, number];
  color?: string;
  opacity: number;
}

/* ---------- seeded random ---------- */

/** Park-Miller minimal standard, seeded per (seed, index): the n-th draw for a clone, 0..1. */
export function cloneRandom(seed: number, index: number, draw = 0): number {
  let s = (Math.abs(Math.floor(seed * 7919 + index * 104729 + draw * 1299709)) % 2147483646) + 1;
  for (let i = 0; i < 3; i++) s = (s * 16807) % 2147483647;
  return (s - 1) / 2147483646;
}

/* ---------- cloners ---------- */

export interface ClonerSpec {
  mode: "grid" | "linear" | "radial";
  count: [number, number, number];
  spacing: [number, number, number];
  step: [number, number, number];
  stepRotation: [number, number, number];
  radius: number;
  plane: "xy" | "xz" | "zy";
  align: boolean;
  /** Grid: odd rows move +x, even rows −x by this much (rows sliding past each other). */
  rowSlide: number;
  /** Grid: extra x per row, px. */
  rowOffset?: number;
  /** Grid: x scroll already multiplied by time, px; wraps within the row length. */
  scroll?: number;
}

const n = (v: number) => Math.max(1, Math.round(v));

/** The clones a cloner makes, centred on its origin (grid, linear) or around it (radial). */
export function makeClones(c: ClonerSpec): Clone[] {
  const out: Clone[] = [];
  const base = (index: number, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]): Clone => ({ index, position, rotation, scale: [100, 100, 100], opacity: 1 });
  if (c.mode === "grid") {
    const [cx, cy, cz] = [n(c.count[0]), n(c.count[1]), n(c.count[2])];
    let i = 0;
    for (let z = 0; z < cz; z++)
      for (let y = 0; y < cy; y++)
        for (let x = 0; x < cx; x++) {
          const slide = (y % 2 ? 1 : -1) * c.rowSlide + (c.rowOffset ?? 0) * (y - (cy - 1) / 2);
          let px = (x - (cx - 1) / 2) * c.spacing[0] + slide;
          if (c.scroll) {
            const W = cx * c.spacing[0];
            px = W > 0 ? ((((px + c.scroll + W / 2) % W) + W) % W) - W / 2 : px;
          }
          // rows go down from the top (y up in the world)
          out.push(base(i++, [px, ((cy - 1) / 2 - y) * c.spacing[1], (z - (cz - 1) / 2) * c.spacing[2]]));
        }
  } else if (c.mode === "linear") {
    const cnt = n(c.count[0]);
    for (let i = 0; i < cnt; i++) {
      const k = i - (cnt - 1) / 2;
      out.push(base(i, [c.step[0] * k, c.step[1] * k, c.step[2] * k], [c.stepRotation[0] * i, c.stepRotation[1] * i, c.stepRotation[2] * i]));
    }
  } else {
    const cnt = n(c.count[0]);
    for (let i = 0; i < cnt; i++) {
      const a = (i / cnt) * Math.PI * 2, s = Math.sin(a) * c.radius, co = Math.cos(a) * c.radius, deg = (a * 180) / Math.PI;
      if (c.plane === "xy") out.push(base(i, [co, s, 0], c.align ? [0, 0, deg] : [0, 0, 0]));
      else if (c.plane === "xz") out.push(base(i, [co, 0, -s], c.align ? [0, deg, 0] : [0, 0, 0]));
      else out.push(base(i, [0, co, s], c.align ? [-deg, 0, 0] : [0, 0, 0]));
    }
  }
  return out;
}

/* ---------- fields ---------- */

export type FieldSpec =
  | { kind: "linear"; position: [number, number, number]; axis: 0 | 1 | 2; sign: 1 | -1; length: number; invert: boolean }
  | { kind: "spherical"; position: [number, number, number]; radius: number; falloff: number; invert: boolean }
  | { kind: "wave"; position: [number, number, number]; angle: number; wavelength: number; phase: number; invert: boolean }
  | { kind: "noise"; scale: number; speed: number; seed: number; t: number; invert: boolean };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => x * x * (3 - 2 * x);

function hash3(x: number, y: number, z: number, seed: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.3) * 43758.5453;
  return s - Math.floor(s);
}
/** Seeded 3D value noise, 0..1. */
function noise3(x: number, y: number, z: number, seed: number) {
  const [ix, iy, iz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  const [fx, fy, fz] = [smooth(x - ix), smooth(y - iy), smooth(z - iz)];
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz, seed);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy), l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}

/** A field's weight at a point in the scene, 0..1. */
export function fieldWeight(f: FieldSpec, p: readonly [number, number, number]): number {
  let w: number;
  if (f.kind === "linear") w = clamp01(((p[f.axis] - f.position[f.axis]) * f.sign) / Math.max(1e-6, f.length) + 0.5);
  else if (f.kind === "spherical") {
    const d = Math.hypot(p[0] - f.position[0], p[1] - f.position[1], p[2] - f.position[2]);
    const inner = f.radius * (1 - clamp01(f.falloff));
    w = d <= inner ? 1 : d >= f.radius ? 0 : smooth(1 - (d - inner) / Math.max(1e-6, f.radius - inner));
  } else if (f.kind === "wave") {
    const a = (f.angle * Math.PI) / 180;
    const u = (p[0] - f.position[0]) * Math.cos(a) + (p[1] - f.position[1]) * Math.sin(a);
    w = 0.5 + 0.5 * Math.sin((2 * Math.PI * u) / Math.max(1, f.wavelength) + f.phase);
  } else {
    const k = 1 / Math.max(1, f.scale);
    w = noise3(p[0] * k, p[1] * k, p[2] * k + f.t * f.speed, f.seed);
  }
  return f.invert ? 1 - w : w;
}

/* ---------- effectors ---------- */

export type EffectorSpec =
  | { kind: "random"; position: [number, number, number]; rotation: [number, number, number]; scale: number; palette: string[]; seed: number; strength: number }
  | { kind: "plain"; position: [number, number, number]; rotation: [number, number, number]; scale: number; strength: number }
  | { kind: "step"; position: [number, number, number]; rotation: [number, number, number]; scale: number; strength: number };

/**
 * Apply an effector to clones. `weightAt` gives the field weight at a clone (1 without a field).
 * Random: ± position / rotation / scale (%) per clone, and a colour from the palette where the
 * weight wins the clone's draw. Plain: adds its values. Step: adds them ramped 0..1 over the clones.
 */
export function applyEffector(clones: Clone[], e: EffectorSpec, weightAt: (c: Clone) => number): Clone[] {
  const last = Math.max(1, clones.length - 1);
  return clones.map((c) => {
    const w = clamp01(e.strength) * clamp01(weightAt(c));
    if (w <= 0) return c;
    const k =
      e.kind === "random"
        ? (draw: number) => (cloneRandom(e.seed, c.index, draw) * 2 - 1) * w
        : e.kind === "step"
          ? () => (c.index / last) * w
          : () => w;
    const pos = c.position.map((v, i) => v + e.position[i]! * k(i)) as Clone["position"];
    const rot = c.rotation.map((v, i) => v + e.rotation[i]! * k(3 + i)) as Clone["rotation"];
    const s = 1 + (e.scale / 100) * k(6);
    const next: Clone = { ...c, position: pos, rotation: rot, scale: c.scale.map((v) => v * s) as Clone["scale"] };
    if (e.kind === "random" && e.palette.length && cloneRandom(e.seed, c.index, 7) < w)
      next.color = e.palette[Math.floor(cloneRandom(e.seed, c.index, 8) * e.palette.length) % e.palette.length];
    return next;
  });
}

/** A clone's matrix in the scene: cloner · clone offset · the object's own matrix. */
export function cloneMatrix(cloner: Mat4, c: Clone, object: Mat4): Mat4 {
  const m = objectMatrix(c.position, c.rotation, c.scale, [0, 0, 0]);
  return mul4(mul4(cloner, m), object);
}

/** Where a clone sits in the scene (for fields). */
export const clonePoint = (cloner: Mat4, c: Clone) => apply4(cloner, c.position);

/** Reveal: clones arrive (in) or leave (out) one after another, Motion Builder's phase timing per clone. */
export interface RevealSpec {
  phase: PhaseSpec;
  /** Per-clone delays in ms (from `phaseDelays`). */
  delays: number[];
  position: [number, number, number];
  rotation: [number, number, number];
  /** Scale at the far end of the move, percent (100 = no scaling, 0 = grows from nothing). */
  scale: number;
}

export function applyReveal(clones: Clone[], r: RevealSpec, tMs: number, inMs: number, outMs: number): Clone[] {
  return clones.map((c, i) => {
    const p = phaseProgress(r.phase, r.delays, i, tMs, inMs, outMs);
    const k = r.phase.mode === "in" ? 1 - p : p; // how far from rest
    if (k <= 0) return c;
    const s = 1 + (r.scale / 100 - 1) * k;
    return {
      ...c,
      position: c.position.map((v, j) => v + r.position[j]! * k) as Clone["position"],
      rotation: c.rotation.map((v, j) => v + r.rotation[j]! * k) as Clone["rotation"],
      scale: c.scale.map((v) => v * s) as Clone["scale"],
    };
  });
}
