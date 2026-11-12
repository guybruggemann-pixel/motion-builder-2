/**
 * Frame comparison for preview-vs-render checks: how far two RGBA frames of the same size are
 * apart. Pure (no canvas), so it runs in tests and in the page alike.
 */
export interface FrameDiff {
  /** Largest difference of any channel, 0..255. */
  max: number;
  /** Mean absolute difference over all channels, 0..255. */
  mean: number;
  /** Share of pixels where any channel differs by more than `threshold`, 0..1. */
  changed: number;
}

export function frameDiff(a: Uint8ClampedArray, b: Uint8ClampedArray, threshold = 8): FrameDiff {
  if (a.length !== b.length) throw new Error(`frames differ in size: ${a.length} vs ${b.length}`);
  let max = 0, sum = 0, changed = 0;
  for (let p = 0; p < a.length; p += 4) {
    let px = 0;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(a[p + c]! - b[p + c]!);
      sum += d;
      if (d > px) px = d;
    }
    if (px > max) max = px;
    if (px > threshold) changed++;
  }
  const n = a.length / 4;
  return { max, mean: n ? sum / (n * 4) : 0, changed: n ? changed / n : 0 };
}

/** Box-downscale an RGBA frame by an integer factor (to compare a full render with a preview size). */
export function downscale(src: Uint8ClampedArray, w: number, h: number, k: number): { data: Uint8ClampedArray; width: number; height: number } {
  const W = Math.floor(w / k), H = Math.floor(h / k), out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += src[((y * k + j) * w + x * k + i) * 4 + c]!;
        out[(y * W + x) * 4 + c] = s / (k * k);
      }
  return { data: out, width: W, height: H };
}
