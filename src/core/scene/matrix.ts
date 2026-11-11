/**
 * 2D affine matrices in canvas `setTransform(a, b, c, d, e, f)` order:
 *   x' = a·x + c·y + e,  y' = b·x + d·y + f
 * Rotation is in degrees, clockwise on screen (y points down), like AE and canvas.
 */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** m · n: apply n first, then m. */
export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const scale = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];
export function rotate(deg: number): Mat {
  if (deg === 0) return IDENTITY;
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

export const applyMat = (m: Mat, [x, y]: readonly [number, number]): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** Uniform scale factor of a matrix (sqrt of |det|): how much a blur radius grows under it. */
export const scaleOf = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

/** AE layer transform: position · rotation · scale(%) · -anchor. */
export function layerMatrix(position: [number, number], anchor: [number, number], scalePct: [number, number], rotation: number): Mat {
  return mul(
    mul(mul(translate(position[0], position[1]), rotate(rotation)), scale(scalePct[0] / 100, scalePct[1] / 100)),
    translate(-anchor[0], -anchor[1]),
  );
}
