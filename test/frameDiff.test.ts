/** The frame-diff helper used for preview-vs-render checks. */
import { describe, expect, it } from "vitest";
import { downscale, frameDiff } from "@/app/render/frameDiff";

const frame = (w: number, h: number, f: (x: number, y: number) => [number, number, number, number]) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 4);
  return d;
};

describe("frameDiff", () => {
  it("is zero for identical frames", () => {
    const a = frame(4, 4, (x, y) => [x * 40, y * 40, 7, 255]);
    expect(frameDiff(a, new Uint8ClampedArray(a))).toEqual({ max: 0, mean: 0, changed: 0 });
  });

  it("reports the largest channel difference, the mean, and the share of changed pixels", () => {
    const a = frame(2, 2, () => [0, 0, 0, 255]);
    const b = frame(2, 2, (x, y) => (x === 0 && y === 0 ? [100, 0, 0, 255] : [4, 0, 0, 255]));
    const d = frameDiff(a, b);
    expect(d.max).toBe(100);
    expect(d.changed).toBe(0.25); // only one pixel is past the threshold of 8
    expect(d.mean).toBeCloseTo((100 + 4 * 3) / 16, 9);
  });

  it("refuses frames of different sizes", () => {
    expect(() => frameDiff(new Uint8ClampedArray(8), new Uint8ClampedArray(4))).toThrow();
  });

  it("downscales by box averaging", () => {
    const a = frame(4, 2, (x) => [x < 2 ? 0 : 200, 0, 0, 255]);
    const s = downscale(a, 4, 2, 2);
    expect([s.width, s.height]).toEqual([2, 1]);
    expect([...s.data]).toEqual([0, 0, 0, 255, 200, 0, 0, 255]);
  });
});
