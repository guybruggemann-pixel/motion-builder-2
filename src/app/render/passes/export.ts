/**
 * Render an AE passes export into a folder: one frame-stepped sweep over the comp renders each
 * layer on its own (beauty), 3D scenes in ID colours (object mattes) and depth, derives the
 * mattes and puzzles from those, and encodes every output as ProRes 4444 in a shared worker pool.
 * Every pass comes from the same evaluated frame, so they line up with the beauty pixel for pixel.
 */
import { evaluateFrame, type SceneDoc } from "@core/scene";
import { canvasMeasure } from "../canvas2d";
import { prores } from "../prores/prores";
import { renderComp, type CompRender } from "../renderComp";
import { encoderPool, has3D } from "../renderJob";
import { depthRange3D, load3D } from "../three/install";
import { alphaOf, idCoverage, matteFrame, puzzleFrame, uncovered, visibleCoverage } from "./coverage";
import { planPasses, type PassOptions, type PassPlan } from "./plan";

const RGB: [number, number, number][] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** The depth range of a scene layer over the whole shot (sampled), so the pass doesn't flicker. */
function shotDepthRange(doc: SceneDoc, netId: string, scene: string, frames: number, fps: number): [number, number] {
  let near = Infinity, far = -Infinity;
  const step = Math.max(1, Math.round(frames / 50));
  for (let f = 0; f < frames; f += step) {
    const d = evaluateFrame(doc, netId, f / fps, { measure: canvasMeasure() }).find((x) => x.kind === "scene3d" && x.node === scene);
    const r = d?.kind === "scene3d" ? depthRange3D(d.scene) : undefined;
    if (r) (near = Math.min(near, r[0])), (far = Math.max(far, r[1]));
  }
  return near === Infinity ? [1, 1000] : [Math.floor(near), Math.ceil(far)];
}

export async function exportPasses(
  doc: SceneDoc,
  netId: string,
  o: PassOptions,
  save: (name: string, blob: Blob) => Promise<void>,
  onProgress: (done: number, total: number) => void,
  cancelled: () => boolean,
): Promise<PassPlan | undefined> {
  if (has3D(doc)) await load3D();
  const plan = planPasses(doc, netId, o);
  const { width: w, height: h, fps, frames } = plan.comp;
  const px = w * h;
  const measure = canvasMeasure();
  const base = { measure, transparent: true } as const;

  const layers = plan.elements.filter((e) => e.kind === "layer");
  const objects = plan.elements.filter((e) => e.kind === "object");
  const beauty = new Map(layers.map((e) => [e.id, renderComp(doc, netId, { ...base, only: new Set([e.node]) })]));
  // 3D objects: ID renders of their scene, three objects per render (R, G, B)
  const ids: { scene: string; render: CompRender; objs: string[] }[] = [];
  if (o.mattes || o.puzzle)
    for (const scene of new Set(objects.map((e) => e.scene!)))
      for (let i = 0, list = objects.filter((e) => e.scene === scene); i < list.length; i += 3) {
        const chunk = list.slice(i, i + 3);
        ids.push({ scene, objs: chunk.map((e) => e.id), render: renderComp(doc, netId, { ...base, only: new Set([scene]), scene3d: { kind: "id", colors: Object.fromEntries(chunk.map((e, k) => [e.node, RGB[k]!])) } }) });
      }
  const depths = plan.outputs.filter((x) => x.kind === "depth");
  const depthRenders = new Map(
    depths.map((x) => {
      const [near, far] = shotDepthRange(doc, netId, x.element!, frames, fps);
      Object.assign(x, { near, far });
      return [x.file, renderComp(doc, netId, { ...base, motionBlur: false, only: new Set([x.element!]), scene3d: { kind: "depth", near, far } })];
    }),
  );

  const pool = encoderPool(w, h);
  try {
    for (let f = 0; f < frames; f++) {
      if (cancelled()) return undefined;
      const frame = new Map<string, Uint8ClampedArray>();
      for (const [id, r] of beauty) frame.set(id, new Uint8ClampedArray(r.frame(f)));
      const alphas = layers.map((e) => alphaOf(frame.get(e.id)!));
      const cov = new Map<string, Uint8Array>(visibleCoverage(alphas).map((c, i) => [layers[i]!.id, c]));
      for (const g of ids) {
        const above = layers.slice(layers.findIndex((e) => e.id === g.scene) + 1).map((e) => alphas[layers.indexOf(e)]!);
        const clear = uncovered(above, px);
        const rgba = g.render.frame(f);
        g.objs.forEach((id, k) => cov.set(id, idCoverage(rgba, k as 0 | 1 | 2, clear)));
      }
      for (const [i, out] of plan.outputs.entries()) {
        let rgba: Uint8ClampedArray;
        if (out.kind === "beauty") rgba = frame.get(out.element!)!;
        else if (out.kind === "matte") rgba = matteFrame(cov.get(out.element!)!);
        else if (out.kind === "puzzle") rgba = puzzleFrame(out.channels!.map((id) => cov.get(id)), px);
        else {
          const d = depthRenders.get(out.file)!.frame(f);
          rgba = new Uint8ClampedArray(d.length);
          for (let p = 0; p < d.length; p += 4) {
            const v = (d[p]! * d[p + 3]!) / 255; // background = far = black
            rgba[p] = rgba[p + 1] = rgba[p + 2] = v;
            rgba[p + 3] = 255;
          }
        }
        await pool.submit(i * frames + f, rgba);
      }
      onProgress(f + 1, frames);
      await new Promise((res) => setTimeout(res, 0));
    }
    await pool.drain();
  } finally {
    pool.close();
  }
  for (const [i, out] of plan.outputs.entries()) {
    const parts = prores().mov(pool.results.slice(i * frames, (i + 1) * frames), w, h, fps, true);
    await save(out.file, new Blob(parts as BlobPart[], { type: "video/quicktime" }));
  }
  return plan;
}
