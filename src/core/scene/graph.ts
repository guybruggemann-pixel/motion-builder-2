/**
 * Network graph helpers: wiring order, layers and what feeds what. Pure, no evaluation.
 */
import { CATALOG, isNodeType, portsOf } from "./catalog";
import type { Network, Node } from "./schema";

/** Nodes with a timeline row: 2D layers, and objects, cameras and lights inside a 3D scene. */
export const isLayer = (n: Node) => isNodeType(n.type) && (CATALOG[n.type].category === "layer" || CATALOG[n.type].category === "3d");

/** Nodes wired into `id`'s main input, in wire order (= paint order for Merge and Group). Named ports (material) excluded. */
export const inputsOf = (net: Network, id: string) => {
  const node = net.nodes.find((n) => n.id === id);
  const ports = node ? portsOf(node.type) : [];
  return net.wires.filter((w) => w.to.node === id && !ports.includes(w.to.port)).map((w) => w.from.node);
};

/**
 * Layer nodes in paint order (first = bottom), as reached from the output, followed by
 * layers that aren't wired to the output (they don't draw).
 */
export function layerOrder(net: Network): { wired: Node[]; unwired: Node[] } {
  const byId = new Map(net.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const wired: Node[] = [];
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const from of inputsOf(net, id)) visit(from);
    const node = byId.get(id);
    if (node && isLayer(node)) wired.push(node);
  };
  visit(net.output);
  return { wired, unwired: net.nodes.filter((n) => isLayer(n) && !seen.has(n.id)) };
}

/** Nodes downstream of a layer, up to (not into) the next layer: the Split/Phase chain acting on it. */
export function chainAfter(net: Network, layerId: string): Node[] {
  const byId = new Map(net.nodes.map((n) => [n.id, n]));
  const out: Node[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    for (const w of net.wires.filter((x) => x.from.node === id)) {
      const n = byId.get(w.to.node);
      if (!n || seen.has(n.id) || isLayer(n)) continue;
      seen.add(n.id);
      out.push(n);
      walk(n.id);
    }
  };
  walk(layerId);
  return out;
}
