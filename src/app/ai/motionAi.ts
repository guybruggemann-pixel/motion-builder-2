/**
 * "Describe the motion" (AI keys): the layer summary sent to the model and the checks that turn
 * its answer into ordinary, editable keys. Pure. The model never edits the doc directly: every
 * proposal goes through `applyProposal`, which keeps only animatable number / vector / colour
 * params of the layer, clamps times into the layer, snaps them to frames and replaces unknown
 * eases, so the result is the same as keys a designer set by hand.
 */
import { z } from "zod";
import { CATALOG, isNodeType, type Network, type Node, type ParamSpec, type SceneDoc, type Value } from "@core/scene";
import { easeChoice } from "@core/motion";
import type { Draft } from "immer";

const KINDS = new Set(["number", "vec2", "vec3", "color"]);

export interface MotionContext {
  layer: { name: string; type: string };
  fps: number;
  /** The layer's in and out point (s), the range keys may use. */
  span: [number, number];
  params: { name: string; kind: string; value: Value; min?: number; max?: number }[];
}

export function motionContext(net: Network, node: Node, fps: number, span: [number, number]): MotionContext {
  const specs = isNodeType(node.type) ? (CATALOG[node.type].params as Record<string, ParamSpec>) : {};
  const params = Object.entries(specs)
    .filter(([, s]) => s.animatable && KINDS.has(s.kind))
    .map(([name, s]) => ({ name, kind: s.kind, value: node.params[name]?.value ?? s.default, min: s.min, max: s.max }));
  void net;
  return { layer: { name: node.name, type: node.type }, fps, span, params };
}

export const Proposal = z.object({
  summary: z.string(),
  tracks: z.array(
    z.object({
      param: z.string(),
      keys: z.array(z.object({ t: z.number(), v: z.union([z.number(), z.array(z.number()), z.string()]), ease: z.string() })),
    }),
  ),
});
export type Proposal = z.infer<typeof Proposal>;

/** Eases the editor understands: the v1 menu (with amounts), cubic beziers, springs, steps and hold. */
export function validEase(e: string): boolean {
  const s = e.replace(/\s+/g, "");
  return s === "hold" || /^steps\(\d+\)$/.test(s) || !!easeChoice(s);
}

const clamp = (v: number, a?: number, b?: number) => Math.min(b ?? Infinity, Math.max(a ?? -Infinity, v));

function shape(kind: string, v: unknown, min?: number, max?: number): Value | undefined {
  if (kind === "color") return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : undefined;
  const n = kind === "number" ? 1 : kind === "vec2" ? 2 : 3;
  const arr = typeof v === "number" ? [v] : Array.isArray(v) ? v : undefined;
  if (!arr || arr.length !== n || arr.some((x) => typeof x !== "number" || !Number.isFinite(x))) return undefined;
  const out = arr.map((x) => clamp(x as number, min, max));
  return n === 1 ? out[0]! : (out as [number, number] | [number, number, number]);
}

/** The keys a proposal adds, checked against the layer. Tracks it can't use are listed in `skipped`. */
export function checkProposal(p: Proposal, ctx: MotionContext) {
  const [a, b] = ctx.span;
  // whole frames inside the layer
  const frame = (t: number) => clamp(Math.round(t * ctx.fps), Math.ceil(a * ctx.fps - 1e-6), Math.floor(b * ctx.fps + 1e-6)) / ctx.fps;
  const tracks: { param: string; keys: { t: number; v: Value; ease: string }[] }[] = [];
  const skipped: string[] = [];
  for (const tr of p.tracks) {
    const spec = ctx.params.find((x) => x.name === tr.param);
    if (!spec) {
      skipped.push(tr.param);
      continue;
    }
    const byT = new Map<number, { t: number; v: Value; ease: string }>();
    for (const k of tr.keys) {
      const v = shape(spec.kind, k.v, spec.min, spec.max);
      if (v === undefined) continue;
      const t = frame(k.t);
      byT.set(t, { t, v, ease: validEase(k.ease) ? k.ease.replace(/\s+/g, "") : "outCubic" });
    }
    const keys = [...byT.values()].sort((x, y) => x.t - y.t);
    if (keys.length >= 2) tracks.push({ param: tr.param, keys });
    else skipped.push(tr.param);
  }
  return { tracks, skipped };
}

/** Writes checked keys onto the layer (replacing that param's keys; base values and modifiers stay). */
export function applyTracks(d: Draft<SceneDoc>, netId: string, nodeId: string, tracks: ReturnType<typeof checkProposal>["tracks"]) {
  const node = d.networks.find((n) => n.id === netId)?.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  for (const tr of tracks) {
    const p = node.params[tr.param];
    if (p) p.keys = tr.keys;
    else node.params[tr.param] = { value: tr.keys[0]!.v, keys: tr.keys };
  }
}
