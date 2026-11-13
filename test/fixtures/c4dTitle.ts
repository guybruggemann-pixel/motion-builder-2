/**
 * A hand-made Cinema 4D dump in the shape `tools/c4d/mb_export.py` writes (mb-c4d-dump/0.2).
 * Replace with a real dump once the script has run in Cinema 4D.
 *
 * Title.c4d (1920x1080, 25 fps, frames 0-100 = 4 s), in C4D's space (y up, +z away from the viewer):
 *  Title      MoText "MOTION", 300 high, 90 deep, heading turns from -30° to 30° with soft tangents
 *  Stage      null at y = -260, holding:
 *    Floor    cube 900 x 20 x 500, material Red
 *  Row        linear cloner, 5 clones 180 apart, at [-360, 240, 0], material Glass, cloning:
 *    Pill     Extrude (depth 30) of a rounded rectangle spline 120 x 50, radius 25
 *  Ball       sphere (not imported)
 *  Camera     at [0, 100, -1800] looking along +z, 50 mm
 *  Key        spot light at [-600, 900, -900], 120 %, turned towards the scene
 */
import type { C4dDump, C4dKey, C4dMatrix, C4dObject } from "../../src/core/library/importC4d";

type V3 = [number, number, number];
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * An HPB matrix as Ry(h) · Rx(p) · Rz(b), columns v1, v2, v3. Whether real Cinema 4D counts the
 * angles this way round is not verified; the importer reads that from each dump.
 */
export function matrix(off: V3, hpb: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): C4dMatrix {
  const [ch, sh, cp, sp, cb, sb] = [Math.cos(hpb[0]), Math.sin(hpb[0]), Math.cos(hpb[1]), Math.sin(hpb[1]), Math.cos(hpb[2]), Math.sin(hpb[2])];
  const k = (v: V3, s: number): V3 => [v[0] * s, v[1] * s, v[2] * s];
  return {
    off,
    v1: k([ch * cb + sh * sp * sb, cp * sb, -sh * cb + ch * sp * sb], scale[0]),
    v2: k([-ch * sb + sh * sp * cb, cp * cb, sh * sb + ch * sp * cb], scale[1]),
    v3: k([sh * cp, -sp, ch * cp], scale[2]),
  };
}

const obj = (name: string, kind: C4dObject["kind"], type: string, o: { pos?: V3; rot?: V3; parentOff?: V3; known?: Record<string, unknown>; materials?: string[]; tracks?: C4dObject["tracks"]; children?: C4dObject[] } = {}): C4dObject => {
  const pos = o.pos ?? [0, 0, 0], rot = o.rot ?? [0, 0, 0], up = o.parentOff ?? [0, 0, 0];
  return { name, kind, type, known: o.known ?? {}, pos, rot, scale: [1, 1, 1], ml: matrix(pos, rot), mg: matrix([pos[0] + up[0], pos[1] + up[1], pos[2] + up[2]], rot), renderVisible: 2, materials: (o.materials ?? []).map((material) => ({ material })), tracks: o.tracks ?? [], children: o.children ?? [] };
};
const soft = (t: number, v: number, dt: number): C4dKey => ({ t, v, interp: "spline", tl: -dt / 3, vl: 0, tr: dt / 3, vr: 0 });

export const c4dTitle: C4dDump = {
  format: "mb-c4d-dump/0.2",
  scene: "Title.c4d",
  fps: 25,
  minTime: 0,
  maxTime: 4,
  render: { width: 1920, height: 1080, fps: 25 },
  activeCamera: "Camera",
  materials: [
    { name: "Red", type: "Material", known: { color: [0.9, 0.1, 0.1], reflection: true } },
    { name: "Glass", type: "Material", known: { color: [1, 1, 1], transparency: 0.9 } },
    { name: "Unused", type: "Material", known: { color: [0, 1, 0] } },
  ],
  objects: [
    obj("Title", "motext", "MoText", {
      rot: [rad(-30), 0, 0],
      known: { text: "MOTION", height: 300, depth: 90, align: "center", font: { family: "Inter Tight", name: "ExtraBold" } },
      tracks: [{ name: "Rotation . H", channel: "rotation.h", keys: [soft(0, rad(-30), 4), soft(4, rad(30), 4)] }],
    }),
    obj("Stage", "null", "Null", { pos: [0, -260, 0], children: [obj("Floor", "cube", "Cube", { parentOff: [0, -260, 0], known: { size: [900, 20, 500], fillet: false }, materials: ["Red"] })] }),
    obj("Row", "cloner", "Cloner", {
      pos: [-360, 240, 0],
      known: { mode: "linear", linearCount: 5, linearStep: [180, 0, 0], linearRotation: [0, 0, 0] },
      materials: ["Glass"],
      children: [obj("Pill", "extrude", "Extrude", { parentOff: [-360, 240, 0], known: { offset: 30 }, children: [obj("Rectangle", "rect-spline", "Rectangle", { parentOff: [-360, 240, 0], known: { width: 120, height: 50, rounding: true, radius: 25 } })] })],
    }),
    obj("Ball", "sphere", "Sphere", { pos: [500, 0, 0] }),
    obj("Camera", "camera", "Camera", { pos: [0, 100, -1800], known: { focalLength: 50, aperture: 36 } }),
    obj("Key", "light", "Light", { pos: [-600, 900, -900], rot: [rad(30), rad(40), 0], known: { type: "spot", color: [1, 0.95, 0.9], brightness: 1.2, outerAngle: rad(60), shadow: 2 } }),
  ],
};
