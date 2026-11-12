/**
 * Matte maths for AE passes, pure (no canvas): from per-element RGBA renders to visible coverage,
 * alpha matte frames and puzzle matte frames. "Visible coverage" is what AE users expect from a
 * holdout matte: the element's alpha with whatever is drawn above it cut out.
 */

/** One element's alpha channel (0..255) from its straight-alpha RGBA render. */
export function alphaOf(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let p = 0, i = 0; p < rgba.length; p += 4, i++) out[i] = rgba[p + 3]!;
  return out;
}

/**
 * Visible coverage of each element given their alphas in paint order (first = bottom):
 * cov_i = a_i · Π_{j above i} (1 − a_j). Returned as 0..255, rounded.
 */
export function visibleCoverage(alphas: readonly Uint8Array[]): Uint8Array[] {
  const n = alphas.length;
  if (!n) return [];
  const px = alphas[0]!.length;
  const out = alphas.map(() => new Uint8Array(px));
  for (let p = 0; p < px; p++) {
    let clear = 1; // how much of the pixel the elements above leave uncovered
    for (let i = n - 1; i >= 0; i--) {
      const a = alphas[i]![p]! / 255;
      out[i]![p] = Math.round(a * clear * 255);
      clear *= 1 - a;
    }
  }
  return out;
}

/** What the elements in `alphas` leave uncovered, per pixel, 0..1 (for occluding a 3D scene's objects). */
export function uncovered(alphas: readonly Uint8Array[], px: number): Float32Array {
  const out = new Float32Array(px).fill(1);
  for (const a of alphas) for (let p = 0; p < px; p++) out[p]! *= 1 - a[p]! / 255;
  return out;
}

/** An opaque white-on-black matte frame from coverage. */
export function matteFrame(cov: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(cov.length * 4);
  for (let i = 0, p = 0; i < cov.length; i++, p += 4) {
    out[p] = out[p + 1] = out[p + 2] = cov[i]!;
    out[p + 3] = 255;
  }
  return out;
}

/** An opaque puzzle matte frame: up to three coverages in R, G and B. */
export function puzzleFrame(covs: readonly (Uint8Array | undefined)[], px: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px * 4);
  for (let i = 0, p = 0; i < px; i++, p += 4) {
    out[p] = covs[0]?.[i] ?? 0;
    out[p + 1] = covs[1]?.[i] ?? 0;
    out[p + 2] = covs[2]?.[i] ?? 0;
    out[p + 3] = 255;
  }
  return out;
}

/**
 * Per-object coverage from a 3D ID render (objects drawn unlit in pure R, G, B, others black,
 * straight alpha): channel × alpha, times what the layers above the scene leave uncovered.
 */
export function idCoverage(rgba: Uint8ClampedArray, channel: 0 | 1 | 2, clear?: Float32Array): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let p = 0, i = 0; p < rgba.length; p += 4, i++) out[i] = Math.round(((rgba[p + channel]! * rgba[p + 3]!) / 255) * (clear ? clear[i]! : 1));
  return out;
}

/** Elements split into groups of three, one puzzle file each. */
export const puzzleGroups = <T,>(items: readonly T[]): T[][] => Array.from({ length: Math.ceil(items.length / 3) }, (_, g) => items.slice(g * 3, g * 3 + 3));
