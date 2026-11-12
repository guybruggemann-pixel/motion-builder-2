/**
 * Network edits as immer recipes (tested in Node). Wire rules beyond these (input counts, loops)
 * are enforced by `validateDoc`, which rejects the edit as a whole.
 */
import type { Draft } from "immer";
import { CATALOG, defaultParams, isNodeType, type Network, type NodeType, type SceneDoc } from "@core/scene";

const netOf = (d: Draft<SceneDoc>, id: string): Draft<Network> => {
  const net = d.networks.find((n) => n.id === id);
  if (!net) throw new Error(`network ${id} not found`);
  return net;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "node";

function freeId(taken: (id: string) => boolean, base: string) {
  const b = /^[a-z]/.test(base) ? base : `n-${base}`;
  if (!taken(b)) return b;
  let i = 2;
  while (taken(`${b}-${i}`)) i++;
  return `${b}-${i}`;
}

export function moveNodes(d: Draft<SceneDoc>, netId: string, moves: { id: string; x: number; y: number }[]) {
  const net = netOf(d, netId);
  for (const m of moves) {
    const n = net.nodes.find((x) => x.id === m.id);
    if (n) n.ui = { x: Math.round(m.x), y: Math.round(m.y) };
  }
}

/** Add a node of a catalog type. A Subnet gets a new, empty network to open into. Returns the id. */
export function addNode(d: Draft<SceneDoc>, netId: string, type: NodeType, at: { x: number; y: number }): string {
  const net = netOf(d, netId);
  const label = CATALOG[type].label;
  const id = freeId((x) => net.nodes.some((n) => n.id === x), slug(type));
  const sameType = net.nodes.filter((n) => n.type === type).length;
  const node = {
    id,
    type,
    name: sameType ? `${label} ${sameType + 1}` : label,
    enabled: true,
    params: type === "Text" || type === "Shape" ? defaultParams(type) : {},
    ui: { x: Math.round(at.x), y: Math.round(at.y) },
  } as Draft<SceneDoc>["networks"][number]["nodes"][number];
  if (type === "Subnet") {
    const subId = freeId((x) => d.networks.some((n) => n.id === x), `${id}-net`);
    d.networks.push({ id: subId, name: node.name, nodes: [{ id: "merge", type: "Merge", name: "Merge", enabled: true, params: {}, ui: { x: 0, y: 0 } }], wires: [], output: "merge" });
    node.subnet = subId;
  }
  net.nodes.push(node);
  return id;
}

/** Wire `from` into `to`. A single-input node swaps its old wire for the new one; duplicates are ignored. */
export function connect(d: Draft<SceneDoc>, netId: string, from: string, to: string) {
  const net = netOf(d, netId);
  if (from === to || net.wires.some((w) => w.from.node === from && w.to.node === to)) return;
  const target = net.nodes.find((n) => n.id === to);
  if (target && isNodeType(target.type) && CATALOG[target.type].inputs === 1) net.wires = net.wires.filter((w) => w.to.node !== to);
  net.wires.push({ from: { node: from, port: "out" }, to: { node: to, port: "in" } });
}

export function disconnect(d: Draft<SceneDoc>, netId: string, wires: { from: string; to: string }[]) {
  const net = netOf(d, netId);
  net.wires = net.wires.filter((w) => !wires.some((x) => x.from === w.from.node && x.to === w.to.node));
}

/**
 * Delete nodes with their wires and any promoted controls pointing at them. The network's output
 * node can't be deleted. Returns the ids actually removed.
 */
export function deleteNodes(d: Draft<SceneDoc>, netId: string, ids: string[]): string[] {
  const net = netOf(d, netId);
  const gone = ids.filter((id) => id !== net.output && net.nodes.some((n) => n.id === id));
  net.nodes = net.nodes.filter((n) => !gone.includes(n.id));
  net.wires = net.wires.filter((w) => !gone.includes(w.from.node) && !gone.includes(w.to.node));
  if (net.promoted) net.promoted = net.promoted.filter((p) => !gone.includes(p.target.node));
  return gone;
}
