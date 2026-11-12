/**
 * 3D scene output of the evaluator: plain data that a renderer (three.js, in src/app) draws.
 * No renderer code here. Conventions:
 * - World units are px, y up, origin at the centre of the scene rectangle, +z towards the camera.
 * - Matrices are 4×4, column-major (three.js `Matrix4.fromArray`).
 * - Text 3D outlines live in the text layout's space (x right, y down, from `layoutLines`); the
 *   renderer maps a layout point (x, y) to object space (x - origin[0], -(y - origin[1])).
 * - Extrusions span z from -depth/2 to +depth/2 in object space.
 * - The default camera (none in the scene) sits on +z and shows the z = 0 plane 1:1 at 50 mm.
 */
import type { FontSpec, Run } from "./text";

export type Mat4 = number[]; // 16, column-major

export interface Material3D {
  /** Node that defined it, or undefined for a layer's own fill. */
  node?: string;
  kind: "solid" | "plastic" | "plaster" | "glass" | "metal" | "iridescent" | "emissive";
  color: string;
  roughness: number;
  metalness: number;
  transmission: number;
  ior: number;
  thickness: number;
  clearcoat: number;
  iridescence: number;
  emission: number;
  grain: number;
}

interface Object3DBase {
  id: string;
  node: string;
  /** Object space → world. */
  matrix: Mat4;
  opacity: number;
  depth: number;
  bevel: number;
  material: Material3D;
  /**
   * From a Cloner: draw one copy per clone (scene matrix, colour tint, opacity) instead of the
   * object at `matrix`. A clone's colour replaces the material's colour.
   */
  clones?: { matrix: Mat4; color?: string; opacity: number }[];
  /** The Cloner that made the clones, and its matrix (so it can be picked and moved as a whole). */
  cloner?: { node: string; matrix: Mat4 };
}

export interface Text3D extends Object3DBase {
  kind: "text";
  runs: Run[];
  font: FontSpec;
  tracking: number;
  /** Layout point that sits at the object's origin (the centre of the text box, per `align`). */
  origin: [number, number];
}

export interface Shape3D extends Object3DBase {
  kind: "shape";
  shape: "rect" | "ellipse" | "path";
  size: [number, number];
  radius: number;
  path: string;
}

export type Object3D = Text3D | Shape3D;

export interface Camera3D {
  node?: string;
  position: [number, number, number];
  target: [number, number, number];
  lens: number;
  /** Vertical field of view in degrees, for the scene's aspect (three.js PerspectiveCamera.fov). */
  fov: number;
  roll: number;
}

export interface Light3D {
  id: string;
  node: string;
  kind: "directional" | "point" | "spot";
  color: string;
  intensity: number;
  position: [number, number, number];
  target: [number, number, number];
  castShadow: boolean;
  softness: number;
  angle: number;
}

export interface Scene3D {
  /** Size of the rectangle the scene renders into, in px. */
  size: [number, number];
  environment: "studio-soft" | "studio-hard" | "overcast" | "none";
  environmentIntensity: number;
  shadows: boolean;
  ambientOcclusion: number;
  camera: Camera3D;
  lights: Light3D[];
  objects: Object3D[];
}

/** AE's film back: 36 mm wide. */
export const FILM_WIDTH_MM = 36;

/** Camera distance that shows the z = 0 plane 1:1 for a scene `width` px wide (AE's "zoom"). */
export const zoomFor = (width: number, lens: number) => (width / 2) * (lens / (FILM_WIDTH_MM / 2));

/** Vertical field of view in degrees for a lens on a 36 mm film back and a width × height frame. */
export function verticalFov(lens: number, width: number, height: number): number {
  const halfH = (FILM_WIDTH_MM / 2) * (height / width);
  return (2 * Math.atan(halfH / lens) * 180) / Math.PI;
}

/* ---------- 4×4 matrices (column-major) ---------- */

export const IDENTITY4: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function mul4(a: Mat4, b: Mat4): Mat4 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  return o;
}

export const translate4 = (x: number, y: number, z: number): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
export const scale4 = (x: number, y: number, z: number): Mat4 => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];

/** Rotation from Euler degrees in three.js 'XYZ' order: R = Rx · Ry · Rz. */
export function rotate4(xDeg: number, yDeg: number, zDeg: number): Mat4 {
  const r = Math.PI / 180;
  const [a, b] = [Math.cos(xDeg * r), Math.sin(xDeg * r)];
  const [d, e] = [Math.cos(yDeg * r), Math.sin(yDeg * r)];
  const [f, g] = [Math.cos(zDeg * r), Math.sin(zDeg * r)];
  const rx: Mat4 = [1, 0, 0, 0, 0, a, b, 0, 0, -b, a, 0, 0, 0, 0, 1];
  const ry: Mat4 = [d, 0, -e, 0, 0, 1, 0, 0, e, 0, d, 0, 0, 0, 0, 1];
  const rz: Mat4 = [f, g, 0, 0, -g, f, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return mul4(mul4(rx, ry), rz);
}

/** Object → world: position · rotation · scale(%) · -anchor (the AE layer order, in 3D). */
export function objectMatrix(position: number[], rotation: number[], scalePct: number[], anchor: number[]): Mat4 {
  const v = (a: number[], i: number, d: number) => a[i] ?? d;
  return mul4(
    mul4(mul4(translate4(v(position, 0, 0), v(position, 1, 0), v(position, 2, 0)), rotate4(v(rotation, 0, 0), v(rotation, 1, 0), v(rotation, 2, 0))), scale4(v(scalePct, 0, 100) / 100, v(scalePct, 1, 100) / 100, v(scalePct, 2, 100) / 100)),
    translate4(-v(anchor, 0, 0), -v(anchor, 1, 0), -v(anchor, 2, 0)),
  );
}

/** A point through a 4×4 matrix. */
export function apply4(m: Mat4, [x, y, z]: readonly [number, number, number]): [number, number, number] {
  return [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
}
