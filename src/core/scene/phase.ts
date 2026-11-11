/**
 * Phase: Motion Builder v1's in/out rig (`AnimeAERig.factors` + `compute`) as a node.
 * A Phase "in" node and a Phase "out" node chained in that order give exactly v1's result;
 * test/phase-parity.test.ts checks it against the ES3 rig.
 *
 * Timing (ms, like v1):
 * - in:  part i starts at  inPoint + start + delay[i]
 * - out: part i finishes at outPoint - start - (maxDelay - delay[i])
 * The in/out points are the part's layer in/out (or 0 and the network span when the layer
 * has no timing), so trimming a layer moves its animation with it, as in AE.
 */
import { ease as easeFn } from "../motion/eases";
import { staggerDelaysMs, type StaggerFromName } from "./delays";

export interface PhaseSpec {
  mode: "in" | "out";
  startMs: number;
  durationMs: number;
  /** anime-ae ease string. */
  ease: string;
  staggerMs: number;
  from: StaggerFromName;
  x: number;
  y: number;
  /** % */
  scale: number;
  rotation: number;
  /** % */
  opacity: number;
  blur: number;
  reveal: "none" | "up" | "down" | "left" | "right";
}

/** Visible slice of a part along one axis, as fractions of its box (0..1). */
export interface Reveal {
  axis: "x" | "y";
  from: number;
  to: number;
}

/** Per-part animation state, in v1's terms. Offsets live in the layer's parent space. */
export interface PartAnim {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  rot: number;
  /** 0..1 */
  op: number;
  blur: number;
  reveal?: Reveal;
}

export const REST: PartAnim = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, op: 1, blur: 0 };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Stagger delays for one phase across n parts (ms). */
export const phaseDelays = (spec: PhaseSpec, n: number) => staggerDelaysMs(spec.staggerMs, spec.from, n);

/**
 * Eased progress of part `idx` at time `tMs`: for "in" the share already arrived (v1 `pin`),
 * for "out" the share already gone (v1 `kout`).
 */
export function phaseProgress(spec: PhaseSpec, delays: readonly number[], idx: number, tMs: number, inPt: number, outPt: number): number {
  const d = delays[idx] ?? 0;
  const e = easeFn(spec.ease);
  if (spec.mode === "in") {
    const start = inPt + spec.startMs + d;
    const u = spec.durationMs > 0 ? clamp((tMs - start) / spec.durationMs, 0, 1) : tMs >= start ? 1 : 0;
    return e(u);
  }
  let maxD = 0;
  for (const x of delays) maxD = Math.max(maxD, x);
  const end = outPt - spec.startMs - (maxD - d);
  const start = end - spec.durationMs;
  const u = spec.durationMs > 0 ? clamp((tMs - start) / spec.durationMs, 0, 1) : tMs >= end ? 1 : 0;
  return e(u);
}

function intersect(a: Reveal | undefined, b: Reveal): Reveal {
  if (!a || a.axis !== b.axis) return b; // different axes: the latest phase wins
  return { axis: a.axis, from: Math.max(a.from, b.from), to: Math.min(a.to, b.to) };
}

function revealSlice(dir: PhaseSpec["reveal"], visible: number, leaving: boolean): Reveal | undefined {
  if (dir === "none") return undefined;
  const v = clamp(visible, 0, 1);
  const axis = dir === "up" || dir === "down" ? "y" : "x";
  // "up": arrives from the bottom edge upward, leaves the same way (bottom first).
  const growsFromFar = dir === "up" || dir === "left";
  const fromFar = leaving ? !growsFromFar : growsFromFar;
  return fromFar ? { axis, from: 1 - v, to: 1 } : { axis, from: 0, to: v };
}

/** Apply one phase on top of a part's state, exactly as v1 `compute` does for its in or out half. */
export function applyPhase(a: PartAnim, spec: PhaseSpec, progress: number): PartAnim {
  const r: PartAnim = { ...a };
  if (spec.mode === "in") {
    const k = 1 - progress, e = 1 - k;
    r.dx += k * spec.x;
    r.dy += k * spec.y;
    r.rot += k * spec.rotation;
    const s = spec.scale / 100 + (1 - spec.scale / 100) * e;
    r.sx *= s;
    r.sy *= s;
    r.op *= clamp(spec.opacity / 100 + (1 - spec.opacity / 100) * e, 0, 1);
    r.blur += Math.max(0, k) * spec.blur;
    const rv = revealSlice(spec.reveal, e, false);
    if (rv) r.reveal = intersect(a.reveal, rv);
    return r;
  }
  const o = progress;
  r.dx += o * spec.x;
  r.dy += o * spec.y;
  r.rot += o * spec.rotation;
  const s = 1 + (spec.scale / 100 - 1) * o;
  r.sx *= s;
  r.sy *= s;
  r.op *= clamp(1 + (spec.opacity / 100 - 1) * o, 0, 1);
  r.blur += Math.max(0, o) * spec.blur;
  const rv = revealSlice(spec.reveal, 1 - o, true);
  if (rv) r.reveal = intersect(a.reveal, rv);
  return r;
}
