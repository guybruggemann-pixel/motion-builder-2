/**
 * Canvas viewer: fits the comp into the panel, draws the current frame (with preview motion
 * blur), a checkerboard where the comp is transparent, and broadcast safe areas on top.
 * All pixels come from `evaluateFrame` via the frame cache; the viewer adds no scene state.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { FrameCache, type Mat } from "@core/scene";
import { canvasMeasure, drawCompFrame, setImageListener } from "@/render/canvas2d";
import { loadFonts } from "@/render/fonts";
import { shownNetwork, useDocStore, useUi, viewComp } from "@/store";

/** SMPTE ST 2046-1: action safe 93 %, title safe 90 %. */
const SAFE = { action: 0.93, title: 0.9 };
const PAD = 24; // CSS px around the comp

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawChecker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cell: number) {
  ctx.fillStyle = cssVar("--surface");
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = cssVar("--accent");
  for (let j = 0; j * cell < h; j++)
    for (let i = (j % 2); i * cell < w; i += 2) ctx.fillRect(x + i * cell, y + j * cell, Math.min(cell, w - i * cell), Math.min(cell, h - j * cell));
}

function drawSafeAreas(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dpr: number) {
  ctx.save();
  ctx.strokeStyle = cssVar("--muted-foreground") || "#999";
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = dpr;
  for (const f of [SAFE.action, SAFE.title]) {
    const iw = w * f, ih = h * f;
    ctx.strokeRect(Math.round(x + (w - iw) / 2) + 0.5, Math.round(y + (h - ih) / 2) + 0.5, Math.round(iw), Math.round(ih));
  }
  const cx = x + w / 2, cy = y + h / 2, arm = 10 * dpr;
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy);
  ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx, cy + arm);
  ctx.stroke();
  ctx.restore();
}

export function Viewer() {
  const doc = useDocStore((s) => s.doc);
  const { path, frame, safeAreas, motionBlur } = useUi();
  const net = shownNetwork(doc, path);
  const comp = viewComp(doc, path);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 });
  const [cache, setCache] = useState<FrameCache>();
  const [imageTick, setImageTick] = useState(0);
  const scratch = useMemo(
    () => ({ sample: new OffscreenCanvas(1, 1).getContext("2d")!, accum: new OffscreenCanvas(1, 1).getContext("2d")! }),
    [],
  );

  // Measure text only once the real fonts are in, or layouts would use fallback metrics.
  useEffect(() => {
    let alive = true;
    loadFonts().then(() => alive && setCache(new FrameCache({ measure: canvasMeasure() })));
    setImageListener(() => setImageTick((n) => n + 1)); // drawables don't change, only pixels
    return () => {
      alive = false;
      setImageListener(undefined);
    };
  }, []);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(([e]) => {
      const r = e!.contentRect;
      setSize({ w: r.width, h: r.height, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !size.w || !size.h) return;
    const W = Math.round(size.w * size.dpr), H = Math.round(size.h * size.dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    for (const s of [scratch.sample, scratch.accum])
      if (s.canvas.width !== W || s.canvas.height !== H) {
        s.canvas.width = W;
        s.canvas.height = H;
      }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const pad = PAD * size.dpr;
    const k = Math.min((W - 2 * pad) / comp.width, (H - 2 * pad) / comp.height);
    if (k <= 0) return;
    const cw = comp.width * k, ch = comp.height * k;
    const ox = Math.round((W - cw) / 2), oy = Math.round((H - ch) / 2);
    const view: Mat = [k, 0, 0, k, ox, oy];

    if (comp.background) {
      const bg = comp.background.startsWith("brand:")
        ? doc.brand?.colors.find((c) => c.token === comp.background!.slice(6))?.value ?? "#000000"
        : comp.background;
      ctx.fillStyle = bg;
      ctx.fillRect(ox, oy, cw, ch);
    } else drawChecker(ctx, ox, oy, cw, ch, 12 * size.dpr);

    if (cache) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, cw, ch);
      ctx.clip();
      drawCompFrame(ctx, scratch, cache, doc, net.id, frame, view, motionBlur ? comp.motionBlur : undefined);
      ctx.restore();
    }
    if (safeAreas) drawSafeAreas(ctx, ox, oy, cw, ch, size.dpr);
  }, [doc, net.id, comp, frame, size, cache, safeAreas, motionBlur, scratch, imageTick]);

  return (
    <div ref={wrap} className="relative min-h-0 flex-1 bg-grid">
      <canvas
        ref={canvas}
        className="absolute inset-0 size-full"
        role="img"
        aria-label={`${net.name}, frame ${frame}`}
      />
      {!cache && (
        <p className="absolute inset-0 grid place-items-center font-mono text-xs text-muted-foreground">Loading fonts</p>
      )}
    </div>
  );
}
