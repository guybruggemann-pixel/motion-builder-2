/**
 * The wave wall: one extruded word, cloned into rows, the wall tilted, a Wave deformer bending
 * every row and a Wave field rocking the rows in depth (dark gaps between them). Eight nodes;
 * change the word and the whole wall follows. Shared by the preset library and pattern rebuilds.
 */
import type { SceneDoc } from "../schema";

export interface WaveWallOptions {
  word: string;
  width: number;
  height: number;
  duration: number;
  /** Words per row and rows. */
  columns: number;
  rows: number;
  /** Wall rotation in the frame, degrees. */
  tilt: number;
  /** Letter lean, degrees. */
  lean: number;
  /** Row bend: px of wave and its length. */
  waveAmount: number;
  wavelength: number;
  /** Wave cycles per second (rounded to loop). */
  speed: number;
  /** Rows rocking forward and back, degrees. */
  rock: number;
  /** Rows scroll along, px per second. */
  scroll: number;
  font: string;
  weight: number;
  size: number;
  depth: number;
  color: string;
  background: string;
  material: "plastic" | "metal" | "plaster" | "glass";
  roughness: number;
}

export const WAVE_WALL_DEFAULTS: WaveWallOptions = {
  word: "WAVE",
  width: 1080,
  height: 1600,
  duration: 6,
  columns: 4,
  rows: 9,
  tilt: 12,
  lean: -12,
  waveAmount: 55,
  wavelength: 1300,
  speed: 0.34,
  rock: 10,
  scroll: 0,
  font: "Oswald",
  weight: 700,
  size: 260,
  depth: 70,
  color: "#E9E9E9",
  background: "#0B0C0F",
  material: "plastic",
  roughness: 0.55,
};

const node = (id: string, type: string, name: string, params: Record<string, unknown>, x: number, y: number, extra: Record<string, unknown> = {}) =>
  ({ id, type, name, enabled: true, params, ui: { x, y }, ...extra }) as SceneDoc["networks"][number]["nodes"][number];
const p = (value: unknown) => ({ value });

export function waveWall(o: Partial<WaveWallOptions> = {}, name = "Wave wall"): SceneDoc {
  const c = { ...WAVE_WALL_DEFAULTS, ...o };
  const word = c.word.trim().toUpperCase() || "WAVE";
  // a condensed glyph is ~0.45 em wide: a little overlap keeps the row continuous
  const wordW = Math.max(c.size * 0.6, word.length * c.size * 0.5 + c.size * 0.12);
  const rowH = c.size * 0.95;
  // enough rows and words to overfill the frame once tilted
  const cols = Math.max(c.columns, Math.ceil((Math.hypot(c.width, c.height) * 1.15) / wordW));
  const rows = Math.max(c.rows, Math.ceil((Math.hypot(c.width, c.height) * 1.05) / rowH));
  return {
    version: 3,
    name,
    root: "main",
    assets: [],
    batches: [],
    networks: [
      {
        id: "main",
        name: "Main_v01",
        comp: { width: c.width, height: c.height, fps: 25, duration: c.duration, background: c.background },
        output: "out",
        wires: [
          { from: { node: "scene", port: "out" }, to: { node: "out", port: "in" } },
        ],
        nodes: [node("scene", "Scene3D", "Wave wall", { size: p([c.width, c.height]), ambientOcclusion: p(0.8), shadows: p(true) }, 0, 0, { subnet: "wall-3d" }), node("out", "Output", "Output", {}, 260, 0)],
      },
      {
        id: "wall-3d",
        name: "Wave wall scene",
        output: "merge",
        wires: [
          { from: { node: "mat", port: "out" }, to: { node: "word", port: "material" } },
          { from: { node: "bend", port: "out" }, to: { node: "word", port: "deformer" } },
          { from: { node: "word", port: "out" }, to: { node: "cloner", port: "in" } },
          { from: { node: "cloner", port: "out" }, to: { node: "rock", port: "in" } },
          { from: { node: "field", port: "out" }, to: { node: "rock", port: "field" } },
          { from: { node: "rock", port: "out" }, to: { node: "merge", port: "in" } },
          { from: { node: "camera", port: "out" }, to: { node: "merge", port: "in" } },
          { from: { node: "key", port: "out" }, to: { node: "merge", port: "in" } },
        ],
        nodes: [
          node("word", "Text3D", "Word", { text: p(word), font: p(c.font), weight: p(c.weight), size: p(c.size), depth: p(c.depth), bevel: p(2), tracking: p(-c.size * 0.02), rotation: p([0, 0, c.lean]) }, 0, 0),
          node("mat", "Material", "Material", { kind: p(c.material), color: p(c.color), roughness: p(c.roughness) }, -240, 0),
          node("bend", "Deformer", "Row wave", { mode: p("wave"), amount: p(c.waveAmount), wavelength: p(c.wavelength), angle: p(c.tilt), speed: p(c.speed), loop: p(true) }, -240, 140),
          node("cloner", "Cloner", "Wall", { mode: p("grid"), count: p([cols, rows, 1]), spacing: p([wordW, rowH, 0]), rowOffset: p(wordW * 0.37), scroll: p(c.scroll), rotation: p([0, 0, c.tilt]) }, 220, 0),
          node("field", "WaveField", "Rock wave", { angle: p(90 + c.tilt), wavelength: p(rowH * 2.2), speed: p(c.speed), loop: p(true) }, 220, 140),
          node("rock", "Plain", "Rock rows", { rotation: p([c.rock, 0, 0]), position: p([0, 0, -c.depth * 0.8]) }, 440, 0),
          node("camera", "Camera", "Camera", { position: p([0, 0, 2666.67 * (c.width / 1920)]), lens: p(50) }, 0, 280),
          node("key", "Light", "Key light", { position: p([-500, 1600, 1400]), intensity: p(2.4), softness: p(0.5) }, 0, 400),
          node("merge", "Merge", "Merge", {}, 660, 120),
        ],
      },
    ],
  };
}
