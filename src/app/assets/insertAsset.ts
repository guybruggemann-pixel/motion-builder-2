import type { Draft } from "immer";
import { sceneOwner, type SceneDoc } from "@core/scene";
import { addNode, wireToOutput } from "@/app/network/edits";

export interface ArtworkAsset {
  id: string; name: string; category: "icons" | "textures"; src: string;
  width: number; height: number; source: string; license: string;
  sourceUrl?: string; attribution?: string;
}

/** Add, never replace: embedded artwork travels with the document. */
export function insertAsset(d: Draft<SceneDoc>, netId: string, asset: ArtworkAsset): string {
  const net = d.networks.find((n) => n.id === netId);
  if (!net || sceneOwner(d, netId)) throw new Error("Artwork belongs in a 2D composition.");
  if (!asset.src.startsWith("data:image/")) throw new Error("Artwork must be embedded before insertion.");
  const comp = net.comp ?? d.networks.find((n) => n.id === d.root)?.comp;
  if (!comp) throw new Error("No composition dimensions available.");
  let assetId = `library-${asset.id}`, i = 2;
  while (d.assets.some((a) => a.id === assetId && a.src !== asset.src)) assetId = `library-${asset.id}-${i++}`;
  if (!d.assets.some((a) => a.id === assetId)) d.assets.push({
    id: assetId, kind: "image", src: asset.src,
    meta: { width: asset.width, height: asset.height, source: asset.source, license: asset.license, sourceUrl: asset.sourceUrl, attribution: asset.attribution },
  });
  const id = addNode(d, netId, "Image", { x: Math.max(0, ...net.nodes.map((n) => n.ui.x)) + 240, y: 0 });
  const node = net.nodes.find((n) => n.id === id);
  if (!node) throw new Error("Couldn't create artwork layer.");
  const size = asset.category === "icons" ? Math.min(comp.width, comp.height) * 0.22 : Math.min(comp.width, comp.height);
  const scale = size / Math.max(asset.width, asset.height);
  node.name = asset.name;
  node.role = asset.category === "icons" ? "icon" : "decoration";
  node.params = {
    asset: { value: assetId },
    position: { value: [(comp.width - asset.width * scale) / 2, (comp.height - asset.height * scale) / 2] },
    scale: { value: [scale * 100, scale * 100] },
  };
  wireToOutput(d, netId, id);
  return id;
}