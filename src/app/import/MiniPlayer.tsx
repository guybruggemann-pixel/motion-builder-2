/** A small looping player for a doc's root comp: the Draft cards' previews. View only. */
import { useEffect, useMemo, useRef, useState } from "react";
import { FrameCache, type SceneDoc } from "@core/scene";
import { canvasMeasure, drawCompFrame } from "@/app/render/canvas2d";
import { loadDocFonts } from "@/app/render/fonts";

/** All players share one clock so the three drafts play in sync. */
const T0 = performance.now();

/** `playing={false}` draws one still (at `still` of the way through), redrawn a few times so a 3D frame lands. */
export function MiniPlayer({ doc, width = 320, playing = true, still = 0.7 }: { doc: SceneDoc; width?: number; playing?: boolean; still?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [cache, setCache] = useState<FrameCache>();
  const comp = doc.networks.find((n) => n.id === doc.root)!.comp!;
  const height = Math.round((width * comp.height) / comp.width);
  const scratch = useMemo(() => ({ sample: new OffscreenCanvas(1, 1).getContext("2d")!, accum: new OffscreenCanvas(1, 1).getContext("2d")! }), []);
  useEffect(() => {
    const canvas = cv.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void loadDocFonts(doc).then(() => alive && setCache(new FrameCache({ measure: canvasMeasure() }))).catch((error: unknown) => console.error("Couldn't load preview fonts", error));
    return () => void (alive = false);
  }, [doc.assets, visible]);
  useEffect(() => {
    const c = cv.current;
    if (!c || !cache || !visible) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = width * dpr;
    c.height = height * dpr;
    const ctx = c.getContext("2d")!;
    const k = (width * dpr) / comp.width;
    const frames = Math.max(1, Math.round(comp.duration * comp.fps));
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#111";
    let raf = 0;
    let n = 0;
    const tick = (now: number) => {
      const f = playing ? Math.floor((((now - T0) / 1000) * comp.fps) % frames) : Math.min(frames - 1, Math.round(frames * still));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = comp.background && !comp.background.startsWith("brand:") ? comp.background : bg;
      ctx.fillRect(0, 0, c.width, c.height);
      drawCompFrame(ctx, scratch, cache, doc, doc.root, f, [k, 0, 0, k, 0, 0], undefined);
      if (playing) raf = requestAnimationFrame(tick);
      else if (++n < 4) timer = window.setTimeout(() => (raf = requestAnimationFrame(tick)), 1200);
    };
    let timer = 0;
    raf = requestAnimationFrame(tick);
    return () => (cancelAnimationFrame(raf), clearTimeout(timer));
  }, [cache, doc, width, height, comp, scratch, playing, still, visible]);
  return <canvas ref={cv} style={{ width: "100%", aspectRatio: `${comp.width} / ${comp.height}` }} className="block rounded-md" aria-label={`Preview of ${doc.name}`} />;
}
