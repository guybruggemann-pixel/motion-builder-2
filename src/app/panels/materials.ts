/**
 * Applying looks from the Library. On a 3D object a material is a Material node wired into its
 * `material` input: a preset updates the object's material in place when only that object uses it,
 * else it gets a new Material node (shared materials stay shared). A colour sets the wired
 * material's colour (or the fill). On a 2D layer everything becomes a Solid: its fill.
 * Recipes are plain immer functions (tested); `applyItem` runs one as one undo step.
 */
import type { Draft } from "immer";
import { CATALOG, isNodeType, KIND_DEFAULTS, presetParams, type MaterialKind, type MaterialPreset, type Network, type Node, type SceneDoc } from "@core/scene";
import { docStore, shownNetwork, useUi, viewComp } from "@/app/store";
import { setValue } from "@/app/inspector/edits";

/** Drag-and-drop type for Library tiles (a JSON `LibraryItem`). */
export const SOLID_MIME = "application/x-motionbuilder-solid";

export type LibraryItem =
  | { kind: "preset"; preset: MaterialPreset }
  | { kind: "colour"; value: string; name: string }
  /** An existing Material node in a 3D network: wire it in (shared). */
  | { kind: "node"; network: string; node: string; name: string };

export const takesMaterial = (type: string) => isNodeType(type) && "fill" in CATALOG[type].params;
const is3DObject = (n: Node) => n.type === "Text3D" || n.type === "Shape3D";

type DNet = Draft<Network>;
const netOf = (d: Draft<SceneDoc>, id: string): DNet => {
  const n = d.networks.find((x) => x.id === id);
  if (!n) throw new Error(`network ${id} not found`);
  return n;
};
const freeId = (net: Network, base: string) => {
  const b = base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "material";
  let id = /^[a-z]/.test(b) ? b : `m-${b}`, i = 2;
  while (net.nodes.some((n) => n.id === id)) id = `${b}-${i++}`;
  return id;
};

/** The Material node wired into an object's material input, if any. */
export function materialOf(net: Network, objId: string): Node | undefined {
  const w = net.wires.find((x) => x.to.node === objId && x.to.port === "material");
  return w && net.nodes.find((n) => n.id === w.from.node && n.type === "Material");
}

/** How many material inputs a Material node feeds. */
export const usersOf = (net: Network, matId: string) => net.wires.filter((w) => w.from.node === matId && w.to.port === "material").length;

function wireMaterial(net: DNet, matId: string, objId: string) {
  net.wires = net.wires.filter((w) => !(w.to.node === objId && w.to.port === "material"));
  net.wires.push({ from: { node: matId, port: "out" }, to: { node: objId, port: "material" } });
}

/** Give a 3D object a preset's look. Returns the Material node id it ends up with. */
export function applyPresetTo(d: Draft<SceneDoc>, netId: string, objId: string, preset: MaterialPreset, t = 0, tol = 0.02): string {
  const net = netOf(d, netId);
  const obj = net.nodes.find((n) => n.id === objId);
  if (!obj) return "";
  const params = Object.fromEntries(Object.entries(presetParams(preset)).map(([k, v]) => [k, { value: v }]));
  const mine = materialOf(net, objId);
  if (mine && usersOf(net, mine.id) === 1) {
    const m = net.nodes.find((n) => n.id === mine.id);
    if (!m) return "";
    for (const [key, param] of Object.entries(params)) setValue(d, netId, m.id, key, param.value, t, tol);
    m.name = preset.name;
    return m.id;
  }
  const id = freeId(net, preset.id);
  net.nodes.push({ id, type: "Material", name: preset.name, enabled: true, params, ui: { x: obj.ui.x - 260, y: obj.ui.y } } as Draft<Node>);
  wireMaterial(net, id, objId);
  return id;
}

/** Wire an existing Material node into an object (it's then shared with its other users). */
export function useMaterialNode(d: Draft<SceneDoc>, netId: string, objId: string, matId: string) {
  wireMaterial(netOf(d, netId), matId, objId);
}

/** Change a material's kind and take that kind's defaults (its colour stays). */
export function setMaterialKind(d: Draft<SceneDoc>, netId: string, matId: string, kind: MaterialKind, t = 0, tol = 0.02) {
  const m = netOf(d, netId).nodes.find((n) => n.id === matId);
  if (!m) return;
  setValue(d, netId, matId, "kind", kind, t, tol);
  for (const [k, v] of Object.entries(KIND_DEFAULTS[kind])) setValue(d, netId, matId, k, v, t, tol);
}

/** Where a Library item lands for a node of the shown network: a 3D object (maybe inside a scene layer) or a 2D fill. */
export function libraryTarget(doc: SceneDoc, net: Network, node: Node, t: number): { net: string; node: string; t: number; is3D: boolean } | undefined {
  if (is3DObject(node)) return { net: net.id, node: node.id, t, is3D: true };
  if (node.type === "Material") return { net: net.id, node: node.id, t, is3D: true };
  if (node.type === "Scene3D" && node.subnet) {
    const inner = doc.networks.find((n) => n.id === node.subnet);
    const obj = inner?.nodes.find((n) => is3DObject(n) && n.enabled);
    return inner && obj ? { net: inner.id, node: obj.id, t: t - (node.timing?.in ?? 0), is3D: true } : undefined;
  }
  return takesMaterial(node.type) ? { net: net.id, node: node.id, t, is3D: false } : undefined;
}

/** The recipe for an item on a target. */
export function applyItemRecipe(target: NonNullable<ReturnType<typeof libraryTarget>>, item: LibraryItem, tol: number) {
  return (d: Draft<SceneDoc>) => {
    const { net, node, t } = target;
    if (target.is3D) {
      const selected = netOf(d, net).nodes.find((n) => n.id === node);
      if (selected?.type === "Material") {
        if (item.kind === "preset") {
          for (const [key, value] of Object.entries(presetParams(item.preset))) setValue(d, net, node, key, value, t, tol);
          selected.name = item.preset.name;
        } else if (item.kind === "colour") setValue(d, net, node, "color", item.value, t, tol);
        return;
      }
      if (item.kind === "preset") return void applyPresetTo(d, net, node, item.preset, t, tol);
      if (item.kind === "node") return void (item.network === net && useMaterialNode(d, net, node, item.node));
      const mat = materialOf(netOf(d, net) as Network, node);
      return void (mat ? setValue(d, net, mat.id, "color", item.value, t, tol) : setValue(d, net, node, "fill", item.value, t, tol));
    }
    // 2D: everything is a Solid fill
    const value = item.kind === "preset" ? item.preset.color : item.kind === "colour" ? item.value : undefined;
    if (value) setValue(d, net, node, "fill", value, t, tol);
  };
}

const itemName = (item: LibraryItem) => (item.kind === "preset" ? item.preset.name : item.name);

/** Apply a Library item to a node of the shown network, one undo step. Returns whether it applied. */
export function applyItem(nodeId: string, item: LibraryItem): boolean {
  const ui = useUi.getState();
  const doc = docStore.getState().doc;
  const net = shownNetwork(doc, ui.path);
  const node = net.nodes.find((n) => n.id === nodeId);
  const fps = viewComp(doc, ui.path).fps;
  const target = node && libraryTarget(doc, net, node, ui.frame / fps);
  if (!target) return false;
  return docStore.getState().edit(`Apply ${itemName(item)}`, applyItemRecipe(target, item, 0.5 / fps));
}

/** A dropped Library tile (SOLID_MIME data) onto a node. */
export function applyDropped(nodeId: string, json: string): boolean {
  try {
    const item = JSON.parse(json) as LibraryItem | { value: string; name: string };
    return applyItem(nodeId, "kind" in item ? item : { kind: "colour", value: item.value, name: item.name });
  } catch {
    return false;
  }
}

/** Kept for callers that apply a plain colour. */
export const applySolid = (nodeId: string, value: string, name: string) => applyItem(nodeId, { kind: "colour", value, name });
