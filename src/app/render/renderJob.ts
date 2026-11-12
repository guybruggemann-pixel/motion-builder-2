/**
 * One render job: a doc's comp to a file Blob (ProRes 4444 + alpha, or H.264 MP4). Used by the
 * Render panel and by batches, so a batch row renders exactly like a single render.
 * Frames are drawn on the page (it has the fonts); ProRes frames encode in parallel workers.
 */
import type { SceneDoc } from "@core/scene";
import { canvasMeasure } from "./canvas2d";
import { encodeMp4 } from "./mp4";
import { prores, proresSource } from "./prores/prores";
import { renderComp } from "./renderComp";
import { load3D } from "./three/install";

/** Whether the doc has 3D scene layers (the 3D pass must be loaded before rendering). */
export const has3D = (doc: SceneDoc) => doc.networks.some((n) => n.nodes.some((x) => x.type === "Scene3D"));

export interface JobOptions {
  format: "prores" | "mp4";
  width: number;
  height: number;
  motionBlur: boolean;
  /** Render only the first n frames (a 3D pass covers its layer's span, not the whole comp). */
  frames?: number;
}

/** A small pool of workers that each run the ProRes encoder; falls back to the page. */
function encoderPool(w: number, h: number) {
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  let url: string | undefined;
  const workers: Worker[] = [];
  try {
    url = URL.createObjectURL(
      new Blob([`${proresSource}\nvar E = null; onmessage = function (e) { var d = e.data; if (!E) E = new self.AnimeAEProRes.Encoder(d.w, d.h, { q: 2 }); var f = E.frame(d.rgba); postMessage({ i: d.i, f: f }, [f.buffer]); };`], { type: "text/javascript" }),
    );
    for (let i = 0; i < n; i++) workers.push(new Worker(url));
  } catch {
    workers.length = 0;
  }
  const local = workers.length ? undefined : new (prores().Encoder)(w, h, { q: 2 });
  const results: Uint8Array[] = [];
  const pending = new Map<number, (f: Uint8Array) => void>();
  workers.forEach((wk) => (wk.onmessage = (e: MessageEvent<{ i: number; f: Uint8Array }>) => pending.get(e.data.i)?.(e.data.f)));
  let next = 0;
  return {
    async encode(i: number, rgba: Uint8ClampedArray) {
      if (local) {
        results[i] = local.frame(rgba);
        return;
      }
      await new Promise<void>((done) => {
        pending.set(i, (f) => {
          results[i] = f;
          pending.delete(i);
          done();
        });
        workers[next++ % workers.length]!.postMessage({ i, w, h, rgba }, [rgba.buffer]);
      });
    },
    results,
    inflight: () => pending.size,
    limit: Math.max(1, workers.length) * 2,
    close() {
      workers.forEach((x) => x.terminate());
      if (url) URL.revokeObjectURL(url);
    },
  };
}


/** Render and encode. Resolves undefined when cancelled. Fonts must be loaded first; the 3D pass loads here when needed. */
export async function renderToBlob(
  doc: SceneDoc,
  networkId: string,
  o: JobOptions,
  onProgress: (done: number, total: number) => void,
  cancelled: () => boolean,
): Promise<{ blob: Blob; ext: "mov" | "mp4"; frames: number } | undefined> {
  const comp = doc.networks.find((n) => n.id === networkId)?.comp ?? doc.networks.find((n) => n.id === doc.root)!.comp!;
  if (has3D(doc)) await load3D(); // never render a 3D layer as its placeholder
  const to = o.frames;
  if (o.format === "mp4") {
    // H.264 has no alpha: render over the comp background, or black
    const r = renderComp(doc, networkId, { width: o.width, height: o.height, motionBlur: o.motionBlur, measure: canvasMeasure(), background: comp.background ? undefined : "#000000", to });
    const blob = await encodeMp4(r.width, r.height, r.fps, r.frames, (i) => r.frame(i), (done) => onProgress(done, r.frames), cancelled);
    return blob && { blob, ext: "mp4", frames: r.frames };
  }
  const r = renderComp(doc, networkId, { width: o.width, height: o.height, motionBlur: o.motionBlur, measure: canvasMeasure(), to });
  const pool = encoderPool(r.width, r.height);
  const pending: Promise<void>[] = [];
  try {
    for (let i = 0; i < r.frames; i++) {
      if (cancelled()) return undefined;
      while (pool.inflight() >= pool.limit) await Promise.race(pending);
      pending.push(pool.encode(i, new Uint8ClampedArray(r.frame(i))));
      onProgress(i + 1, r.frames);
      await new Promise((res) => setTimeout(res, 0)); // let the page breathe
    }
    await Promise.all(pending);
  } finally {
    pool.close();
  }
  const parts = prores().mov(pool.results, r.width, r.height, r.fps, true);
  return { blob: new Blob(parts as BlobPart[], { type: "video/quicktime" }), ext: "mov", frames: r.frames };
}
