/**
 * Pattern recipes from the AI rebuild: when a reference is a repeat pattern (a wall of waving
 * type), the AI answers with a few numbers instead of flat layers. This filter clamps them to sane
 * ranges and builds the cloner / field / deformer setup. Pure; anything unknown becomes undefined.
 */
import { waveWall, WAVE_WALL_DEFAULTS, type WaveWallOptions } from "../examples/waveWall";
import type { SceneDoc } from "../schema";

export type PatternRecipe = { kind: "wave-wall" } & Partial<WaveWallOptions>;

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : d);

/** The recipe the AI proposed, cleaned; undefined when it isn't a known pattern. */
export function checkPatternRecipe(raw: unknown): PatternRecipe | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.kind !== "wave-wall") return undefined;
  const D = WAVE_WALL_DEFAULTS;
  const word = typeof r.word === "string" ? r.word.replace(/[^\p{L}\p{N} &!?.-]/gu, "").trim().slice(0, 24) : "";
  return {
    kind: "wave-wall",
    word: word || D.word,
    columns: Math.round(num(r.columns, 1, 12, D.columns)),
    rows: Math.round(num(r.rows, 1, 24, D.rows)),
    tilt: num(r.tilt, -90, 90, D.tilt),
    lean: num(r.lean, -60, 60, D.lean),
    waveAmount: num(r.waveAmount, 0, 400, D.waveAmount),
    wavelength: num(r.wavelength, 100, 5000, D.wavelength),
    speed: num(r.speed, -3, 3, D.speed),
    rock: num(r.rock, -60, 60, D.rock),
    scroll: num(r.scroll, -800, 800, D.scroll),
    color: hex(r.color, D.color),
    background: hex(r.background, D.background),
    material: (["plastic", "metal", "plaster", "glass"] as const).find((m) => m === r.material) ?? D.material,
  };
}

/** The doc a recipe builds, at the reference's comp size. */
export const buildPattern = (p: PatternRecipe, size: { width: number; height: number; duration: number }, name: string): SceneDoc => waveWall({ ...p, ...size }, name);
