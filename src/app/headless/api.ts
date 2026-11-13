/**
 * The headless render API: the app's own renderer behind `window.mbHeadless`, for a driver
 * (Playwright, `tools/render/`) to call. There is no second renderer: this runs `renderToBlob` and
 * `renderComp`, the same code as the Render panel, so headless output is the app's output.
 */
import { canvasMeasure, preloadImages } from "../render/canvas2d";
import { loadDocFonts } from "../render/fonts";
import { renderComp } from "../render/renderComp";
import { has3D, renderToBlob } from "../render/renderJob";
import { install3D, load3D } from "../render/three/install";
import { prepareDoc } from "./prepare";
import type { HeadlessApi, HeadlessOptions, HeadlessResult } from "./types";

const results = new Map<string, Blob>();
let seq = 0;

async function render(input: unknown, options: HeadlessOptions): Promise<HeadlessResult> {
  const doc = prepareDoc(input, options);
  const networkId = options.network ?? doc.root;
  const net = doc.networks.find((n) => n.id === networkId);
  if (!net) throw new Error(`Network "${networkId}" isn't in the doc.`);
  const comp = net.comp ?? doc.networks.find((n) => n.id === doc.root)!.comp!;
  const width = options.width ?? comp.width, height = options.height ?? comp.height;
  const motionBlur = options.motionBlur ?? true;
  const progress = (done: number, total: number) => window.mbProgress?.(done, total);

  // Everything that loads lazily in the viewer must be there before frame 0.
  await loadDocFonts(doc);
  await preloadImages(doc.assets.filter((a) => a.kind === "image" || a.kind === "svg").map((a) => a.src));
  if (has3D(doc)) await load3D();

  let blob: Blob, ext: HeadlessResult["ext"], frames: number;
  if (options.format === "frames") {
    const r = renderComp(doc, networkId, { width, height, motionBlur, measure: canvasMeasure(), from: options.from, to: options.to });
    const parts: BlobPart[] = [];
    for (let i = 0; i < r.frames; i++) {
      parts.push(new Uint8Array(r.frame(i)));
      progress(i + 1, r.frames);
      if (i % 8 === 7) await new Promise((res) => setTimeout(res, 0));
    }
    blob = new Blob(parts, { type: "application/octet-stream" });
    ext = "rgba";
    frames = r.frames;
  } else {
    const out = await renderToBlob(doc, networkId, { format: options.format, width, height, motionBlur, frames: options.to }, progress, () => false);
    if (!out) throw new Error("The render was cancelled.");
    ({ blob, ext, frames } = out);
  }
  const id = `r${++seq}`;
  results.set(id, blob);
  return { id, size: blob.size, ext, width, height, fps: comp.fps, frames };
}

async function read(id: string, offset: number, length: number): Promise<string> {
  const blob = results.get(id);
  if (!blob) throw new Error(`No result "${id}".`);
  const bytes = new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Puts the API on the page. Safe to call more than once. */
export function installHeadless(): HeadlessApi {
  install3D();
  return (window.mbHeadless ??= { version: 1, render, read, release: (id) => void results.delete(id) });
}
