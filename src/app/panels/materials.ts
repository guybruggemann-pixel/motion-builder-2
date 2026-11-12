/**
 * Applying a Solid material (a colour) to a layer, until material nodes land (phase D): it sets
 * the layer's fill like an inspector edit would (on a keyed fill: the key at the playhead).
 */
import { CATALOG, isNodeType } from "@core/scene";
import { docStore, shownNetwork, useUi, viewComp } from "@/store";
import { setValue } from "@/inspector/edits";

/** Drag-and-drop type for a solid material tile. */
export const SOLID_MIME = "application/x-motionbuilder-solid";

export const takesMaterial = (type: string) => isNodeType(type) && "fill" in CATALOG[type].params;

/** Set the layer's fill to `value` (a hex colour or a brand token). Returns whether it applied. */
export function applySolid(nodeId: string, value: string, name: string): boolean {
  const ui = useUi.getState();
  const doc = docStore.getState().doc;
  const net = shownNetwork(doc, ui.path);
  const node = net.nodes.find((n) => n.id === nodeId);
  if (!node || !takesMaterial(node.type)) return false;
  const fps = viewComp(doc, ui.path).fps;
  return docStore.getState().edit(`Apply ${name}`, (d) => setValue(d, net.id, nodeId, "fill", value, ui.frame / fps, 0.5 / fps));
}
