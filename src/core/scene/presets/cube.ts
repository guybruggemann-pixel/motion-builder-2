/**
 * Type cube: rows of extruded words wrapped round the faces of a box, each row turning on the
 * box's vertical axis in steps, row after row. Every word pivots round the box centre through its
 * anchor (TRS · -anchor), so the words of one row share identical rotation keys and turn as one
 * solid slice. Pure; ordinary Text3D / Camera / Light / Material / Shape3D nodes.
 */
import type { SceneDoc } from "../schema";

export interface TypeCubeOptions {
  width: number;
  height: number;
  /** Words round the box, front then clockwise seen from above (1-4; repeats to fill 4 faces). */
  faces: string[];
  rows: number;
  /** Box width in px (each face). */
  box: number;
  depth: number;
  font: string;
  weight: number;
  color: string;
  background: string;
  material: "plastic" | "metal" | "plaster" | "glass";
  /** Degrees per move. */
  turn: number;
  /** Seconds per move, seconds held after, seconds between rows. */
  turnTime: number;
  hold: number;
  delay: number;
  /** Moves per loop. */
  steps: number;
  /** Odd rows turn the other way. */
  alternate: boolean;
  /** Camera height and side angle, degrees. */
  elevation: number;
  azimuth: number;
}

export const TYPE_CUBE_DEFAULTS: TypeCubeOptions = {
  width: 1080, height: 1080, faces: ["CITIES", "HOOP"], rows: 5, box: 620, depth: 70, font: "Inter", weight: 800,
  color: "#E8E8E8", background: "#000000", material: "plaster", turn: 90, turnTime: 0.7, hold: 0.5, delay: 0.08, steps: 4,
  alternate: false, elevation: 18, azimuth: -35,
};

const node = (id: string, type: string, name: string, params: Record<string, unknown>, x: number, y: number) =>
  ({ id, type, name, enabled: true, params, ui: { x, y } }) as SceneDoc["networks"][number]["nodes"][number];
const p = (value: unknown) => ({ value });
const r2 = (n: number) => Math.round(n * 1000) / 1000;

/** Rotation keys (y, degrees, relative to the face) for row `i`. */
export function cubeRowKeys(c: TypeCubeOptions, i: number, base: number) {
  const dir = c.alternate && i % 2 ? -1 : 1;
  const keys: { t: number; v: [number, number, number]; ease: string }[] = [{ t: 0, v: [0, base, 0], ease: "linear" }];
  let a = base;
  for (let k = 0; k < c.steps; k++) {
    const t0 = r2(k * (c.turnTime + c.hold) + c.hold * 0.5 + i * c.delay);
    keys.push({ t: t0, v: [0, a, 0], ease: "inOutCubic" });
    a += dir * c.turn;
    keys.push({ t: r2(t0 + c.turnTime), v: [0, a, 0], ease: "linear" });
  }
  return keys;
}

export const typeCubeDuration = (c: TypeCubeOptions) => r2(c.steps * (c.turnTime + c.hold) + (c.rows - 1) * c.delay);

export function typeCube(o: Partial<TypeCubeOptions> = {}, name = "Type cube"): SceneDoc {
  const c = { ...TYPE_CUBE_DEFAULTS, ...o };
  const src = (c.faces.map((w) => w.trim().toUpperCase()).filter(Boolean).slice(0, 4));
  const words = src.length ? src : TYPE_CUBE_DEFAULTS.faces;
  const faces = [0, 1, 2, 3].map((f) => words[f % words.length]!);
  const half = c.box / 2;
  // fit the longest word to the face width (a bold capital plus tracking is ~0.78 em)
  const longest = Math.max(...faces.map((w) => w.length));
  const size = Math.round(c.box / (longest * 0.78));
  const rowH = size * 0.92;
  const top = ((c.rows - 1) * rowH) / 2;
  const nodes = [] as SceneDoc["networks"][number]["nodes"];
  const wires: SceneDoc["networks"][number]["wires"] = [];
  for (let i = 0; i < c.rows; i++) {
    for (let f = 0; f < 4; f++) {
      const id = `r${i}f${f}`;
      nodes.push(node(id, "Text3D", `Row ${i + 1} · ${faces[f]}`, {
        text: p(faces[f]), font: p(c.font), weight: p(c.weight), size: p(size), depth: p(c.depth), bevel: p(2), tracking: p(-size * 0.03),
        position: p([0, r2(top - i * rowH - size * 0.35), 0]), anchor: p([0, 0, -(half - c.depth / 2)]),
        rotation: { value: [0, f * 90, 0], keys: cubeRowKeys(c, i, f * 90) },
      }, f * 200, i * 120));
      wires.push({ from: { node: "mat", port: "out" }, to: { node: id, port: "material" } }, { from: { node: id, port: "out" }, to: { node: "merge", port: "in" } });
    }
  }
  const dist = 2666.67 * (c.width / 1920) * 1.05;
  const el = (c.elevation * Math.PI) / 180, az = (c.azimuth * Math.PI) / 180;
  const cam: [number, number, number] = [r2(Math.sin(az) * Math.cos(el) * dist), r2(Math.sin(el) * dist), r2(Math.cos(az) * Math.cos(el) * dist)];
  nodes.push(
    node("mat", "Material", "Material", { kind: p(c.material), color: p(c.color), roughness: p(0.7) }, -240, 0),
    node("floor", "Shape3D", "Floor", { shape: p("rect"), size: p([c.box * 6, c.box * 6]), depth: p(2), fill: p("#0A0A0A"), position: p([0, r2(-top - rowH * 0.6), 0]), rotation: p([-90, 0, 0]) }, -240, 200),
    node("camera", "Camera", "Camera", { position: p(cam), target: p([0, 0, 0]), lens: p(50) }, -240, 340),
    node("key", "Light", "Key light", { position: p([-900, 1600, 1400]), intensity: p(2.6), softness: p(0.6) }, -240, 460),
    node("fill", "Light", "Fill light", { position: p([1200, 400, 900]), intensity: p(0.8), castShadow: p(false) }, -240, 560),
    node("merge", "Merge", "Merge", {}, 1000, 300),
  );
  for (const id of ["floor", "camera", "key", "fill"]) wires.push({ from: { node: id, port: "out" }, to: { node: "merge", port: "in" } });
  return {
    version: 3, name, root: "main", assets: [], batches: [],
    networks: [
      {
        id: "main", name: "Main_v01",
        comp: { width: c.width, height: c.height, fps: 25, duration: typeCubeDuration(c), background: c.background },
        output: "out",
        wires: [{ from: { node: "scene", port: "out" }, to: { node: "out", port: "in" } }],
        nodes: [{ ...node("scene", "Scene3D", "Type cube", { size: p([c.width, c.height]), ambientOcclusion: p(0.7), shadows: p(true) }, 0, 0), subnet: "cube-3d" } as SceneDoc["networks"][number]["nodes"][number], node("out", "Output", "Output", {}, 260, 0)],
      },
      { id: "cube-3d", name: "Type cube scene", output: "merge", wires, nodes },
    ],
  } as SceneDoc;
}

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : d);

/** The AI's "type-cube" answer, cleaned; undefined when it isn't one. */
export function checkCubeRecipe(raw: unknown): Partial<TypeCubeOptions> | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.kind !== "type-cube") return undefined;
  const D = TYPE_CUBE_DEFAULTS;
  const faces = (Array.isArray(r.words) ? r.words : []).map((w) => (typeof w === "string" ? w.replace(/[^\p{L}\p{N} &!?.-]/gu, "").trim().slice(0, 16) : "")).filter(Boolean).slice(0, 4);
  return {
    faces: faces.length ? faces : D.faces,
    rows: Math.round(num(r.rows, 1, 12, D.rows)),
    depth: num(r.depth, 0, 300, D.depth),
    color: hex(r.color, D.color), background: hex(r.background, D.background),
    material: (["plastic", "metal", "plaster", "glass"] as const).find((m) => m === r.material) ?? D.material,
    turn: num(r.turn, -360, 360, D.turn) || D.turn,
    turnTime: num(r.turnTime, 0.1, 4, D.turnTime), hold: num(r.hold, 0, 4, D.hold), delay: num(r.delay, 0, 1, D.delay),
    steps: Math.round(num(r.steps, 1, 8, D.steps)), alternate: r.alternate === true,
    elevation: num(r.elevation, -60, 60, D.elevation), azimuth: num(r.azimuth, -80, 80, D.azimuth),
  };
}
