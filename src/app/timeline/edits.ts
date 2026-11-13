/**
 * Timeline edits as immer recipes on the doc draft. Pure: no React, no store, so they're tested
 * directly. Times are seconds in the edited network's time; callers snap them to frames.
 */
import type { Draft } from "immer";
import type { Key, Network, Node, SceneDoc } from "@core/scene";
import type { KeyRef } from "@/app/store/uiStore";

const EPS = 1e-6;

const netOf = (d: Draft<SceneDoc>, id: string) => {
  const net = d.networks.find((n) => n.id === id);
  if (!net) throw new Error(`network ${id} not found`);
  return net;
};
const nodeOf = (net: Draft<Network>, id: string) => {
  const node = net.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`node ${net.id}/${id} not found`);
  return node;
};
const sortKeys = (keys: Draft<Key>[]) => keys.sort((a, b) => a.t - b.t);

/**
 * Shift keys by dt. Returns the keys' new refs, or null (and changes nothing) when a key would go
 * below 0 or land on a key that isn't moving.
 */
export function moveKeys(d: Draft<SceneDoc>, networkId: string, refs: readonly KeyRef[], dt: number): KeyRef[] | null {
  const net = netOf(d, networkId);
  const moving = refs.map((r) => {
    const keys = nodeOf(net, r.node).params[r.param]?.keys ?? [];
    const key = keys.find((k) => Math.abs(k.t - r.t) < EPS);
    if (!key) throw new Error(`no key at ${r.node}.${r.param} @ ${r.t}`);
    return { r, key, keys };
  });
  for (const { key, keys } of moving) {
    const t = key.t + dt;
    if (t < -EPS) return null;
    if (keys.some((k) => !moving.some((m) => m.key === k) && Math.abs(k.t - t) < EPS)) return null;
  }
  for (const m of moving) m.key.t = Math.max(0, m.key.t + dt);
  for (const m of moving) sortKeys(m.keys);
  return moving.map(({ r, key }) => ({ ...r, t: key.t }));
}

/** Delete keys. A param left without keys keeps the deleted key's value (AE behaviour). */
export function deleteKeys(d: Draft<SceneDoc>, networkId: string, refs: readonly KeyRef[]) {
  const net = netOf(d, networkId);
  for (const r of refs) {
    const param = nodeOf(net, r.node).params[r.param];
    const i = param?.keys?.findIndex((k) => Math.abs(k.t - r.t) < EPS) ?? -1;
    if (!param?.keys || i < 0) continue;
    const [gone] = param.keys.splice(i, 1);
    if (!param.keys.length) {
      param.value = gone!.v;
      delete param.keys;
    }
  }
}

export type BarDrag = "move" | "in" | "out";

/**
 * Move or trim a layer bar by dt. Moving shifts the layer's own keys with it (AE), Subnets
 * included: keys on the instance (its transform, its promoted controls) are in the parent's time.
 * What's inside a Subnet follows by itself, because it runs on local time. Trimming leaves keys alone.
 * A layer without timing gets [0, span] first.
 */
export function dragLayer(d: Draft<SceneDoc>, networkId: string, nodeId: string, mode: BarDrag, dt: number, span: number, minLen: number) {
  const node: Draft<Node> = nodeOf(netOf(d, networkId), nodeId);
  const timing = (node.timing ??= { in: 0, out: span });
  if (mode === "move") {
    const shift = Math.max(dt, -timing.in);
    timing.in += shift;
    timing.out += shift;
    for (const p of Object.values(node.params))
      if (p.keys) {
        for (const k of p.keys) k.t = Math.max(0, k.t + shift);
        sortKeys(p.keys);
      }
  } else if (mode === "in") timing.in = Math.min(Math.max(0, timing.in + dt), timing.out - minLen);
  else timing.out = Math.max(timing.out + dt, timing.in + minLen);
}
