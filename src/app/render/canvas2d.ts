/**
 * Canvas 2D renderer: draws the drawables `evaluateFrame` returns. No scene logic lives here;
 * if something looks wrong, the bug is in core or in this mapping, never in extra state.
 *
 * Phase 2 reuses this for the frame-stepped web render, so keep it free of React and of the viewer.
 */
import type { Drawable, MeasureText, Scene3DDrawable, SceneDoc, ShapeDrawable } from "@core/scene";
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
/** Ask the viewer to draw again: something that loads asynchronously (an image, fonts, the 3D pass) is ready. */
export const requestRedraw = () => onImage?.();

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

/**
 * Load images before a final render, so no frame draws without them (the viewer just redraws
 * when one arrives; a render can't). Resolves when each has loaded or failed.
 */
export function preloadImages(srcs: Iterable<string>): Promise<void> {
  return Promise.all(
    [...new Set(srcs)].map((src) => {
      const img = image(src) ?? images.get(src)!;
      if (img.complete) return undefined;
      return new Promise<void>((done) => {
        img.addEventListener("load", () => done(), { once: true });
        img.addEventListener("error", () => done(), { once: true });
      });
    }),
  ).then(() => undefined);
}

function perimeter(d: ShapeDrawable): number | undefined {
  const [w, h] = d.size;
  if (d.shape === "rect") return 2 * (Math.abs(w) + Math.abs(h));
  if (d.shape === "line") return Math.hypot(w, h);
  if (d.shape === "ellipse") {
    const a = Math.abs(w) / 2, b = Math.abs(h) / 2; // Ramanujan
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  // polyline paths (M/L only): sum the segments; other SVG paths aren't trimmed yet
  if (/^[ML\d\s.,eE+-]+$/.test(d.path)) {
    const n = d.path.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
    let len = 0;
    for (let i = 2; i + 1 < n.length; i += 2) len += Math.hypot(n[i]! - n[i - 2]!, n[i + 1]! - n[i - 1]!);
    return len || undefined;
  }
  return undefined;
}

/** The fill as a canvas paint: flat colour, or a gradient across the box [0, 0] to [w, h]. */
function paint(ctx: Ctx2D, fill: string, g: { type: "linear" | "radial"; to: string; angle: number } | undefined, w: number, h: number): string | CanvasGradient {
  if (!g) return fill;
  const cx = w / 2, cy = h / 2;
  let grad: CanvasGradient;
  if (g.type === "radial") grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, Math.hypot(w, h) / 2));
  else {
    const a = (g.angle * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
    const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2 || 1;
    grad = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  }
  grad.addColorStop(0, fill);
  grad.addColorStop(1, g.to);
  return grad;
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
    ctx.fillStyle = paint(ctx, d.fill, d.gradient, w, h);
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
/** Options for special renders (AE passes): how 3D scene layers draw. Opaque to this module. */
export interface DrawOptions {
  scene3d?: unknown;
}

export function drawFrame(ctx: Ctx2D, drawables: readonly Drawable[], view: Mat, opts: DrawOptions = {}) {
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
        if (d.gradient) {
          // box of the run: its measured width, cap height above the baseline
          const m = ctx.measureText(d.text);
          ctx.save();
          ctx.translate(0, -m.actualBoundingBoxAscent);
          ctx.fillStyle = paint(ctx, d.fill, d.gradient, m.width, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
          ctx.fillText(d.text, 0, m.actualBoundingBoxAscent);
          ctx.restore();
        } else {
          ctx.fillStyle = d.fill;
          ctx.fillText(d.text, 0, 0);
        }
        if (d.strokeWidth && d.stroke) {
          ctx.strokeStyle = d.stroke;
          ctx.lineWidth = d.strokeWidth;
          ctx.lineJoin = "round";
          ctx.strokeText(d.text, 0, 0);
        }
        break;
      case "shape":
        drawShape(ctx, d);
        break;
      case "image": {
        const img = d.src ? image(d.src) : undefined;
        if (img) ctx.drawImage(img, 0, 0);
        break;
      }
      case "scene3d":
        draw3D(ctx, d, opts.scene3d);
        break;
      case "subnet": {
        if (!d.children || !d.size || !d.alphaThreshold) break;
        const pixelScale = k * Math.sqrt(Math.abs(d.matrix[0] * d.matrix[3] - d.matrix[1] * d.matrix[2]));
        const w = Math.max(1, Math.round(d.size[0] * pixelScale));
        const h = Math.max(1, Math.round(d.size[1] * pixelScale));
        const source = new OffscreenCanvas(w, h);
        const sourceCtx = source.getContext("2d");
        const fused = new OffscreenCanvas(w, h);
        const fusedCtx = fused.getContext("2d", { willReadFrequently: true });
        if (!sourceCtx || !fusedCtx) break;
        drawFrame(sourceCtx, d.children, [pixelScale, 0, 0, pixelScale, 0, 0], opts);
        fusedCtx.filter = `blur(${d.blur * pixelScale}px)`;
        fusedCtx.drawImage(source, 0, 0);
        fusedCtx.filter = "none";
        const pixels = fusedCtx.getImageData(0, 0, w, h);
        for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = (pixels.data[i] ?? 0) >= d.alphaThreshold * 255 ? 255 : 0;
        fusedCtx.putImageData(pixels, 0, 0);
        ctx.filter = "none";
        ctx.drawImage(fused, 0, 0, d.size[0], d.size[1]);
        break;
      }
    }
    ctx.restore();
  }
}

/**
 * Draws a 3D scene layer. The three.js pass plugs in here (`setScene3DRenderer`); until it does,
 * or where it isn't available (tests), the layer shows as a labelled outline.
 */
type Scene3DRenderer = (ctx: Ctx2D, d: Scene3DDrawable, mode?: unknown) => boolean;
let scene3d: Scene3DRenderer | undefined;
export const setScene3DRenderer = (r: Scene3DRenderer | undefined) => void (scene3d = r);

function draw3D(ctx: Ctx2D, d: Scene3DDrawable, mode?: unknown) {
  if (scene3d?.(ctx, d, mode)) return;
  const [w, h] = d.size;
  ctx.save();
  ctx.strokeStyle = "rgba(127,127,127,0.6)";
  ctx.setLineDash([12, 8]);
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = "rgba(127,127,127,0.8)";
  ctx.font = "500 28px Inter, sans-serif";
  ctx.fillText(`3D scene · ${d.scene.objects.length} objects, ${d.scene.lights.length} lights`, 24, 48);
  ctx.restore();
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
