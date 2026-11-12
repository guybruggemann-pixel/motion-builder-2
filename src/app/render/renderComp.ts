/**
 * Frame-stepped render of a comp to straight RGBA frames: every frame is evaluated at its exact
 * time (never the wall clock), motion blur averages sub-frame samples over the shutter in
 * premultiplied float, like v1. No React; runs on any 2D canvas (page or OffscreenCanvas).
 */
import { FrameCache, type Mat, type MeasureText, type SceneDoc } from "@core/scene";
import { drawFrame, shutterSamples } from "./canvas2d";

export interface RenderOptions {
  /** Output size in px; the comp is scaled to fit. Defaults to the comp size. */
  width?: number;
  height?: number;
  /** Use the comp's motion blur settings (default true when the comp has them). */
  motionBlur?: boolean;
  /** Opaque background colour, or undefined to keep alpha (the comp background is drawn if set). */
  background?: string;
  measure: MeasureText;
  /** Frames [from, to), defaults to the whole comp. */
  from?: number;
  to?: number;
}

type Ctx2D = OffscreenCanvasRenderingContext2D;

export interface CompRender {
  width: number;
  height: number;
  fps: number;
  frames: number;
  /** Straight RGBA bytes for frame i (comp frame from + i). */
  frame(i: number): Uint8ClampedArray;
}

export function renderComp(doc: SceneDoc, networkId: string, opts: RenderOptions): CompRender {
  const net = doc.networks.find((n) => n.id === networkId);
  const comp = net?.comp ?? doc.networks.find((n) => n.id === doc.root)!.comp!;
  const width = opts.width ?? comp.width, height = opts.height ?? comp.height;
  const k = Math.min(width / comp.width, height / comp.height);
  const view: Mat = [k, 0, 0, k, (width - comp.width * k) / 2, (height - comp.height * k) / 2];
  const from = opts.from ?? 0, to = opts.to ?? Math.max(1, Math.round(comp.duration * comp.fps));
  const blur = (opts.motionBlur ?? true) && comp.motionBlur && comp.motionBlur.shutter > 0 ? comp.motionBlur : undefined;
  const cache = new FrameCache({ measure: opts.measure }, 64);
  const canvas = new OffscreenCanvas(width, height);
  const g = canvas.getContext("2d", { willReadFrequently: true }) as Ctx2D;
  // Only a comp has a background; a subnet rendered on its own (a 3D pass, a precomp) keeps alpha.
  const own = net?.comp?.background;
  const bg = opts.background ?? (own?.startsWith("brand:") ? doc.brand?.colors.find((c) => c.token === own.slice(6))?.value : own);

  const one = (f: number) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, width, height);
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, width, height);
    }
    drawFrame(g, cache.frame(doc, networkId, f), view);
    return g.getImageData(0, 0, width, height).data;
  };

  return {
    width,
    height,
    fps: comp.fps,
    frames: to - from,
    frame(i) {
      const f = from + i;
      if (!blur) return one(f);
      const times = shutterSamples(f, blur);
      const first = new Uint8ClampedArray(one(times[0]!)), last = one(times.at(-1)!);
      let still = true;
      for (let p = 0; p < first.length; p++) if (first[p] !== last[p]) { still = false; break; }
      if (still) return first; // nothing moves during this frame's shutter
      const acc = new Float32Array(first.length);
      times.forEach((t, s) => {
        const d = s === 0 ? first : s === times.length - 1 ? last : one(t);
        for (let p = 0; p < d.length; p += 4) {
          const a = d[p + 3]!;
          acc[p]! += d[p]! * a;
          acc[p + 1]! += d[p + 1]! * a;
          acc[p + 2]! += d[p + 2]! * a;
          acc[p + 3]! += a;
        }
      });
      const out = new Uint8ClampedArray(first.length);
      for (let p = 0; p < out.length; p += 4) {
        const a = acc[p + 3]!;
        if (a > 0) {
          out[p] = acc[p]! / a;
          out[p + 1] = acc[p + 1]! / a;
          out[p + 2] = acc[p + 2]! / a;
        }
        out[p + 3] = a / times.length;
      }
      return out;
    },
  };
}
