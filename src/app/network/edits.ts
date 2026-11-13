/**
 * Network edits as immer recipes (tested in Node). Wire rules beyond these (input counts, loops)
 * are enforced by `validateDoc`, which rejects the edit as a whole.
 */
import type { Draft } from "immer";
import { CATALOG, defaultParams, isNodeType, zoomFor, type Network, type NodeType, type SceneDoc } from "@core/scene";

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
    params: ["Text", "Shape", "Text3D", "Shape3D", "Material", "Cloner"].includes(type) ? defaultParams(type as NodeType) : {},
    ui: { x: Math.round(at.x), y: Math.round(at.y) },
  } as Draft<SceneDoc>["networks"][number]["nodes"][number];
  if (type === "Scene3D") {
    // A new 3D scene opens into a network with a title, its material, a camera and a key light.
    const comp = d.networks.find((n) => n.id === d.root)?.comp;
    const [w, h] = [comp?.width ?? 1920, comp?.height ?? 1080];
    const subId = freeId((x) => d.networks.some((n) => n.id === x), `${id}-3d`);
    const mk = (nid: string, t: NodeType, name: string, params: Record<string, unknown>, x: number, y: number) =>
      ({ id: nid, type: t, name, enabled: true, params, ui: { x, y } }) as Draft<SceneDoc>["networks"][number]["nodes"][number];
    d.networks.push({
      id: subId,
      name: node.name,
      output: "merge",
      nodes: [
        // turned a little and in a colour, so it reads as 3D on any background
        mk("title", "Text3D", "Title", { ...defaultParams("Text3D"), text: { value: "Title" }, size: { value: 260 }, depth: { value: 70 }, bevel: { value: 4 }, rotation: { value: [10, -28, 0] } }, 0, 0),
        mk("material", "Material", "Material", { ...defaultParams("Material"), color: { value: d.brand?.colors[0] ? `brand:${d.brand.colors[0].token}` : "#1F4BFF" }, roughness: { value: 0.35 } }, -260, 0),
        mk("camera", "Camera", "Camera", { position: { value: [0, 0, Math.round(zoomFor(w, 50) * 100) / 100] } }, 0, 140),
        mk("key", "Light", "Key light", {}, 0, 280),
        mk("merge", "Merge", "Merge", {}, 260, 120),
      ],
      wires: [
        { from: { node: "title", port: "out" }, to: { node: "merge", port: "in" } },
        { from: { node: "material", port: "out" }, to: { node: "title", port: "material" } },
        { from: { node: "camera", port: "out" }, to: { node: "merge", port: "in" } },
        { from: { node: "key", port: "out" }, to: { node: "merge", port: "in" } },
      ],
    });
    node.subnet = subId;
    node.params = { size: { value: [w, h] } };
  }
  if (type === "Subnet") {
    const subId = freeId((x) => d.networks.some((n) => n.id === x), `${id}-net`);
    d.networks.push({ id: subId, name: node.name, nodes: [{ id: "merge", type: "Merge", name: "Merge", enabled: true, params: {}, ui: { x: 0, y: 0 } }], wires: [], output: "merge" });
    node.subnet = subId;
  }
  net.nodes.push(node);
  return id;
}

/**
 * Wire a new layer into what the network draws, on top of everything else: into the output's
 * Merge, or into a new Merge put in front of a single-input Output. Nothing happens if it's
 * already wired somewhere.
 */
export function wireToOutput(d: Draft<SceneDoc>, netId: string, nodeId: string) {
  const net = netOf(d, netId);
  if (net.wires.some((w) => w.from.node === nodeId)) return;
  const out = net.nodes.find((n) => n.id === net.output);
  if (!out) return;
  const wire = (from: string, to: string) => net.wires.push({ from: { node: from, port: "out" }, to: { node: to, port: "in" } });
  if (out.type !== "Output") return void wire(nodeId, out.id); // a Merge (or Group) output takes many
  const into = net.wires.find((w) => w.to.node === out.id);
  const feeder = into && net.nodes.find((n) => n.id === into.from.node);
  if (!into) return void wire(nodeId, out.id);
  if (feeder?.type === "Merge") return void wire(nodeId, feeder.id);
  // Output takes one input: put a Merge in front, with the old input below the new layer
  const mid = freeId((x) => net.nodes.some((n) => n.id === x), "merge");
  net.nodes.push({ id: mid, type: "Merge", name: "Merge", enabled: true, params: {}, ui: { x: out.ui.x - 240, y: out.ui.y + 160 } } as Draft<SceneDoc>["networks"][number]["nodes"][number]);
  net.wires = net.wires.filter((w) => w !== into);
  wire(into.from.node, mid);
  wire(nodeId, mid);
  wire(mid, out.id);
}

/**
 * Put `nodeId` right after `after` in its chain (a Cloner after an object, an effector after a
 * Cloner): whatever `after` fed now comes from the new node. If `after` fed nothing, the new node
 * is wired into what the network draws.
 */
export function insertAfter(d: Draft<SceneDoc>, netId: string, after: string, nodeId: string) {
  const net = netOf(d, netId);
  const outs = net.wires.filter((w) => w.from.node === after && w.to.port === "in");
  if (outs.length) for (const w of outs) w.from.node = nodeId;
  net.wires.push({ from: { node: after, port: "out" }, to: { node: nodeId, port: "in" } });
  if (!outs.length) wireToOutput(d, netId, nodeId);
}

/**
 * Wire `from` into `to` (into a named port like `material`, or the main input). A single-input
 * node, and every named port, swaps its old wire for the new one; duplicates are ignored.
 */
export function connect(d: Draft<SceneDoc>, netId: string, from: string, to: string, port = "in") {
  const net = netOf(d, netId);
  if (port !== "in") {
    if (from === to) return;
    net.wires = net.wires.filter((w) => !(w.to.node === to && w.to.port === port));
    net.wires.push({ from: { node: from, port: "out" }, to: { node: to, port } });
    return;
  }
  if (from === to || net.wires.some((w) => w.from.node === from && w.to.node === to && w.to.port === port)) return;
  const target = net.nodes.find((n) => n.id === to);
  if (target && isNodeType(target.type) && CATALOG[target.type].inputs === 1) net.wires = net.wires.filter((w) => w.to.node !== to || w.to.port !== "in");
  net.wires.push({ from: { node: from, port: "out" }, to: { node: to, port: "in" } });
}

export function disconnect(d: Draft<SceneDoc>, netId: string, wires: { from: string; to: string; port?: string }[]) {
  const net = netOf(d, netId);
  net.wires = net.wires.filter((w) => !wires.some((x) => x.from === w.from.node && x.to === w.to.node && (x.port === undefined || x.port === w.to.port)));
}

/** A reconnect is one validated edit: invalid targets restore the original wire automatically. */
export function reconnect(d: Draft<SceneDoc>, netId: string, old: { from: string; to: string; port: string }, next: { from: string; to: string; port: string }) {
  disconnect(d, netId, [old]);
  connect(d, netId, next.from, next.to, next.port);
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
