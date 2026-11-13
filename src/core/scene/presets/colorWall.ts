/**
 * Colour wall: one chunky extruded word cloned into a tight wall, each copy a colour from a palette
 * (Random effector), rows sliding past each other. The camera starts low and to the side over a
 * tilted wall, then swings to a straight front view as the wall levels. Pure; ordinary nodes.
 */
import type { SceneDoc } from "../schema";

export interface ColorWallOptions {
  word: string; width: number; height: number; duration: number;
  palette: string[]; background: string; size: number; depth: number;
  /** Wall tilt at the start (deg) and px rows slide over the clip (odd and even rows opposite). */
  tilt: number; slide: number;
  /** When the camera swings to the front (s) and how long it takes. */
  swingAt: number; swingTime: number;
  /** Words push towards the camera on a travelling wave: px, cycles per second, direction (deg). */
  push: number; waveSpeed: number; waveAngle: number;
}

export const COLOR_WALL_DEFAULTS: ColorWallOptions = {
  word: "UNIQUE", width: 1080, height: 1320, duration: 10,
  palette: ["#3C6FE0", "#4F86F0", "#2A3FA8", "#8A4FF0", "#7B3FE4", "#E07BEA", "#ECEAE4"],
  background: "#2A3FA8", size: 230, depth: 150, tilt: 28, slide: 420, swingAt: 5.6, swingTime: 0.9, push: 170, waveSpeed: 0.3, waveAngle: 35,
};

const node = (id: string, type: string, name: string, params: Record<string, unknown>, x: number, y: number) =>
  ({ id, type, name, enabled: true, params, ui: { x, y } }) as SceneDoc["networks"][number]["nodes"][number];
const p = (value: unknown) => ({ value });

export function colorWall(o: Partial<ColorWallOptions> = {}, name = "Colour wall"): SceneDoc {
  const c = { ...COLOR_WALL_DEFAULTS, ...o };
  const word = c.word.trim().toUpperCase() || "UNIQUE";
  const wordW = word.length * c.size * 0.6;
  const rowH = c.size * 0.74;
  const span = Math.hypot(c.width, c.height) * 1.6;
  const cols = Math.ceil(span / wordW) + 1, rows = Math.ceil(span / rowH);
  const dist = 2666.67 * (c.width / 1920);
  const a = c.swingAt, b = c.swingAt + c.swingTime;
  return {
    version: 3, name, root: "main", assets: [], batches: [],
    networks: [
      {
        id: "main", name: "Main_v01",
        comp: { width: c.width, height: c.height, fps: 30, duration: c.duration, background: c.background },
        output: "out",
        wires: [{ from: { node: "scene", port: "out" }, to: { node: "out", port: "in" } }],
        nodes: [{ ...node("scene", "Scene3D", "Colour wall", { size: p([c.width, c.height]), ambientOcclusion: p(0.9), shadows: p(true) }, 0, 0), subnet: "wall-3d" } as SceneDoc["networks"][number]["nodes"][number], node("out", "Output", "Output", {}, 260, 0)],
      },
      {
        id: "wall-3d", name: "Colour wall scene", output: "merge",
        wires: [
          { from: { node: "mat", port: "out" }, to: { node: "word", port: "material" } },
          { from: { node: "word", port: "out" }, to: { node: "cloner", port: "in" } },
          { from: { node: "cloner", port: "out" }, to: { node: "colors", port: "in" } },
          { from: { node: "colors", port: "out" }, to: { node: "depth", port: "in" } },
          { from: { node: "field", port: "out" }, to: { node: "depth", port: "field" } },
          { from: { node: "depth", port: "out" }, to: { node: "merge", port: "in" } },
          { from: { node: "camera", port: "out" }, to: { node: "merge", port: "in" } },
          { from: { node: "key", port: "out" }, to: { node: "merge", port: "in" } },
          { from: { node: "fill", port: "out" }, to: { node: "merge", port: "in" } },
        ],
        nodes: [
          node("word", "Text3D", "Word", { text: p(word), font: p("Outfit"), weight: p(900), size: p(c.size), depth: p(c.depth), bevel: p(8), tracking: p(-c.size * 0.02) }, 0, 0),
          node("mat", "Material", "Material", { kind: p("plastic"), color: p("#FFFFFF"), roughness: p(0.6) }, -240, 0),
          node("cloner", "Cloner", "Wall", {
            mode: p("grid"), count: p([cols, rows, 1]), spacing: p([wordW, rowH, 0]), rowOffset: p(wordW * 0.41),
            rowSlide: { value: 0, keys: [{ t: 0, v: -c.slide / 2, ease: "linear" }, { t: c.duration, v: c.slide / 2, ease: "linear" }] },
            rotation: { value: [0, 0, 0], keys: [{ t: 0, v: [0, 0, c.tilt], ease: "hold" }, { t: a, v: [0, 0, c.tilt], ease: "inOutCubic" }, { t: b, v: [0, 0, 0], ease: "linear" }] },
          }, 220, 0),
          node("colors", "Random", "Colours", { strength: p(1), palette: p(c.palette.join(",")), seed: p(7) }, 440, 0),
          node("field", "WaveField", "Depth wave", { angle: p(c.waveAngle), wavelength: p(wordW * 2.3), speed: p(c.waveSpeed), loop: p(true) }, 440, 140),
          node("depth", "Plain", "Push in and out", { position: p([0, 0, c.push]) }, 660, 0),
          node("camera", "Camera", "Camera", {
            target: p([0, 0, 0]), lens: { value: 50, keys: [{ t: 0, v: 35, ease: "hold" }, { t: a, v: 35, ease: "inOutCubic" }, { t: b, v: 50, ease: "linear" }] },
            position: { value: [0, 0, dist], keys: [{ t: 0, v: [-dist * 0.2, -dist * 0.38, dist * 0.72], ease: "inOutSine" }, { t: a, v: [dist * 0.05, -dist * 0.34, dist * 0.75], ease: "inOutCubic" }, { t: b, v: [0, 0, dist], ease: "linear" }] },
          }, 0, 280),
          node("key", "Light", "Key light", { position: p([-900, 1400, 1600]), intensity: p(2.4), softness: p(0.6) }, 0, 400),
          node("fill", "Light", "Fill light", { position: p([1200, -300, 1200]), intensity: p(0.7), castShadow: p(false) }, 0, 520),
          node("merge", "Merge", "Merge", {}, 880, 120),
        ],
      },
    ],
  } as SceneDoc;
}
