/**
 * Where drawables are on screen: boxes for the selection outline and the contextual toolbar, and
 * hit testing for click-to-select in the viewer. Plain functions (no React), like the renderer.
 */
import { applyMat, ASCENT, DESCENT, mul, type Drawable, type Mat, type MeasureText } from "@core/scene";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The drawable's box in its own space, or undefined when it has no known size. */
export function localBox(d: Drawable, measure: MeasureText): [number, number, number, number] | undefined {
  if (d.kind === "subnet" && d.size) return [0, 0, d.size[0], d.size[1]];
  if (d.kind === "shape" || d.kind === "scene3d") return [0, 0, d.size[0], d.size[1]];
  if (d.kind === "text") {
    const s = d.font.size;
    return [0, -ASCENT * s, measure(d.text, d.font) + d.tracking * [...d.text].length, (ASCENT + DESCENT) * s];
  }
  return undefined;
}

const corners = ([x, y, w, h]: [number, number, number, number]): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/** Axis-aligned box around these drawables in view space (after `view`), or undefined if none has a size. */
export function boxOf(drawables: readonly Drawable[], view: Mat, measure: MeasureText): Box | undefined {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of drawables) {
    const b = localBox(d, measure);
    if (!b) continue;
    const m = mul(view, d.matrix);
    for (const c of corners(b)) {
      const [x, y] = applyMat(m, c);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x0 === Infinity ? undefined : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The topmost visible drawable under (x, y) in view space. */
export function hitTest(drawables: readonly Drawable[], view: Mat, measure: MeasureText, x: number, y: number): Drawable | undefined {
  return hitTestAll(drawables, view, measure, x, y)[0]?.d;
}

/** Every visible drawable under (x, y), topmost first, with the point in the drawable's own space. */
export function hitTestAll(drawables: readonly Drawable[], view: Mat, measure: MeasureText, x: number, y: number): { d: Drawable; lx: number; ly: number }[] {
  const out: { d: Drawable; lx: number; ly: number }[] = [];
  for (let i = drawables.length - 1; i >= 0; i--) {
    const d = drawables[i]!;
    if (d.opacity <= 0.01) continue;
    const b = localBox(d, measure);
    if (!b) continue;
    const [a, bb, c, dd, e, f] = mul(view, d.matrix);
    const det = a * dd - bb * c;
    if (Math.abs(det) < 1e-12) continue;
    // invert the 2D affine: local = M⁻¹ (p - t)
    const px = x - e, py = y - f;
    const lx = (dd * px - c * py) / det, ly = (-bb * px + a * py) / det;
    if (lx >= b[0] && lx <= b[0] + b[2] && ly >= b[1] && ly <= b[1] + b[3]) out.push({ d, lx, ly });
  }
  return out;
}

/**
 * Which node of the shown network a drawable belongs to: the node itself, or the Subnet instance
 * it came out of (its contents are flattened into the shown network's list).
 */
export function ownerIn(networkId: string, d: Drawable): string {
  return d.network === networkId ? d.node : d.instance[0] ?? d.node;
}
