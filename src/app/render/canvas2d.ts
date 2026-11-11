/**
 * Canvas 2D renderer: draws the drawables `evaluateFrame` returns. No scene logic lives here;
 * if something looks wrong, the bug is in core or in this mapping, never in extra state.
 *
 * Phase 2 reuses this for the frame-stepped web render, so keep it free of React and of the viewer.
 */
import type { Drawable, MeasureText, SceneDoc, ShapeDrawable } from "@core/scene";
import { FrameCache, type Mat } from "@core/scene";

export const fontString = (f: { family: string; weight: number; size: number }) => `${f.weight} ${f.size}px "${f.family}"`;

/** Canvas-backed `MeasureText` for core: plain advance width, tracking is added by core. */
export function canvasMeasure(): MeasureText {
  const ctx = new OffscreenCanvas(1, 1).getContext("2d")!;
  const memo = new Map<string, number>();
  return (text, font) => {
    const key = `${fontString(font)}|${text}`;
    let w = memo.get(key);
    if (w === undefined) {
      ctx.font = fontString(font);
      ctx.letterSpacing = "0px";
      w = ctx.measureText(text).width;
      memo.set(key, w);
    }
    return w;
  };
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const times = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

const images = new Map<string, HTMLImageElement>();
/** Images load asynchronously; `onImage` is called when one arrives so the caller can redraw. */
let onImage: (() => void) | undefined;
export const setImageListener = (fn: (() => void) | undefined) => void (onImage = fn);

function image(src: string): HTMLImageElement | undefined {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => onImage?.();
    img.src = src;
    images.set(src, img);
  }
  return img.complete && img.naturalWidth ? img : undefined;
}

function perimeter(d: ShapeDrawable): number | undefined {
  const [w, h] = d.size;
  if (d.shape === "rect") return 2 * (Math.abs(w) + Math.abs(h));
  if (d.shape === "line") return Math.hypot(w, h);
  if (d.shape === "ellipse") {
    const a = Math.abs(w) / 2, b = Math.abs(h) / 2; // Ramanujan
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  return undefined; // SVG paths: trim not drawn yet
}

function drawShape(ctx: Ctx2D, d: ShapeDrawable) {
  const [w, h] = d.size;
  const path = d.shape === "path" ? new Path2D(d.path) : new Path2D();
  if (d.shape === "rect") path.roundRect(Math.min(0, w), Math.min(0, h), Math.abs(w), Math.abs(h), Math.min(d.radius, Math.abs(w) / 2, Math.abs(h) / 2));
  else if (d.shape === "ellipse") path.ellipse(w / 2, h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
  else if (d.shape === "line") {
    path.moveTo(0, 0);
    path.lineTo(w, h);
  }
  if (d.shape !== "line") {
    ctx.fillStyle = d.fill;
    ctx.fill(path);
  }
  if (d.strokeWidth > 0) {
    const len = perimeter(d);
    if (len !== undefined && d.trimEnd < 100) ctx.setLineDash([(len * Math.max(0, d.trimEnd)) / 100, len]);
    ctx.strokeStyle = d.stroke;
    ctx.lineWidth = d.strokeWidth;
    ctx.stroke(path);
    ctx.setLineDash([]);
  }
}

/**
 * Draw drawables. `view` maps comp pixels to canvas pixels (fit + device pixel ratio);
 * blur radii are scaled by it because canvas filters ignore the current transform.
 */
export function drawFrame(ctx: Ctx2D, drawables: readonly Drawable[], view: Mat) {
  const k = Math.sqrt(Math.abs(view[0] * view[3] - view[1] * view[2]));
  for (const d of drawables) {
    if (d.opacity <= 0) continue;
    ctx.save();
    for (const c of d.clips) {
      ctx.setTransform(...times(view, c.matrix));
      ctx.beginPath();
      ctx.rect(...c.rect);
      ctx.clip();
    }
    ctx.setTransform(...times(view, d.matrix));
    ctx.globalAlpha = d.opacity;
    if (d.blur > 0.01) ctx.filter = `blur(${d.blur * k}px)`;
    switch (d.kind) {
      case "text":
        ctx.font = fontString(d.font);
        ctx.letterSpacing = `${d.tracking}px`;
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.fillStyle = d.fill;
        ctx.fillText(d.text, 0, 0);
        break;
      case "shape":
        drawShape(ctx, d);
        break;
      case "image": {
        const img = d.src ? image(d.src) : undefined;
        if (img) ctx.drawImage(img, 0, 0);
        break;
      }
    }
    ctx.restore();
  }
}

/** Sub-frame times for motion blur: spread over the shutter, centred on the frame (AE's default phase). */
export function shutterSamples(frame: number, blur: { shutter: number; samples: number }): number[] {
  const n = blur.samples;
  return Array.from({ length: n }, (_, i) => frame + (-blur.shutter / 2 + (blur.shutter * i) / (n - 1)) / 360);
}

/**
 * Comp frame onto `ctx` (background is the caller's). With motion blur, each sub-frame is drawn
 * into `sample` and summed into `accum` at 1/n ("lighter" adds premultiplied RGBA), which is the
 * true average including alpha. 8-bit per sample, so fine for preview; the phase 2 render
 * accumulates in float.
 */
export function drawCompFrame(
  ctx: Ctx2D,
  scratch: { sample: Ctx2D; accum: Ctx2D },
  cache: FrameCache,
  doc: SceneDoc,
  networkId: string,
  frame: number,
  view: Mat,
  blur: { shutter: number; samples: number } | undefined,
) {
  if (!blur || blur.shutter <= 0) {
    drawFrame(ctx, cache.frame(doc, networkId, frame), view);
    return;
  }
  const { sample, accum } = scratch;
  const { width, height } = ctx.canvas;
  const times = shutterSamples(frame, blur);
  accum.setTransform(1, 0, 0, 1, 0, 0);
  accum.clearRect(0, 0, width, height);
  accum.globalCompositeOperation = "lighter";
  accum.globalAlpha = 1 / times.length;
  for (const t of times) {
    sample.setTransform(1, 0, 0, 1, 0, 0);
    sample.clearRect(0, 0, width, height);
    drawFrame(sample, cache.frame(doc, networkId, t), view);
    accum.drawImage(sample.canvas, 0, 0);
  }
  accum.globalCompositeOperation = "source-over";
  accum.globalAlpha = 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(accum.canvas, 0, 0);
  ctx.restore();
}
