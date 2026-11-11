/**
 * Frame cache keyed by doc identity + network + frame number.
 *
 * Relies on the doc being immutable: every edit (store patch, AI write, import) produces a new
 * doc object, so a changed doc misses the cache and an old one is garbage-collected with its frames.
 * Frames may be fractional (motion-blur sub-frame samples). Returned arrays are shared: don't mutate.
 */
import { evaluateFrame, type Drawable, type EvaluateOptions } from "./evaluate";
import type { SceneDoc } from "./schema";

export class FrameCache {
  private docs = new WeakMap<SceneDoc, Map<string, Drawable[]>>();

  constructor(
    private readonly opts: EvaluateOptions = {},
    /** Per doc; the oldest frame is dropped first. */
    private readonly maxFrames = 2000,
  ) {}

  /** Frame rate a network plays at: its own comp, else the root comp. */
  static fps(doc: SceneDoc, networkId: string): number {
    const comp = doc.networks.find((n) => n.id === networkId)?.comp ?? doc.networks.find((n) => n.id === doc.root)?.comp;
    return comp?.fps ?? 25;
  }

  frame(doc: SceneDoc, networkId: string, frame: number): Drawable[] {
    let frames = this.docs.get(doc);
    if (!frames) this.docs.set(doc, (frames = new Map()));
    const key = `${networkId}@${frame}`;
    const hit = frames.get(key);
    if (hit) return hit;
    const result = evaluateFrame(doc, networkId, frame / FrameCache.fps(doc, networkId), this.opts);
    if (frames.size >= this.maxFrames) frames.delete(frames.keys().next().value!);
    frames.set(key, result);
    return result;
  }

  clear(): void {
    this.docs = new WeakMap();
  }
}
