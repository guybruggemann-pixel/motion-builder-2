import { useStore } from "zustand";
import { lowerThird, networkSpan, type SceneDoc } from "@core/scene";
import { createDocStore, type DocState } from "./docStore";
import type { Crumb } from "./uiStore";

/** The app's one doc store. Starts on the reference lower third until file open lands. */
export const docStore = createDocStore(lowerThird);
export const useDocStore = <T,>(pick: (s: DocState) => T): T => useStore(docStore, pick);

/** Full path including the root comp, with crumbs whose network no longer exists dropped. */
export function fullPath(doc: SceneDoc, path: readonly Crumb[]): Crumb[] {
  const out: Crumb[] = [{ network: doc.root }];
  for (const c of path) if (doc.networks.some((n) => n.id === c.network)) out.push(c);
  return out;
}

/** The network shown in the viewer and timeline: the last opened subnet, else the root comp. */
export function shownNetwork(doc: SceneDoc, path: readonly Crumb[]) {
  const id = fullPath(doc, path).at(-1)!.network;
  return doc.networks.find((n) => n.id === id)!;
}

/** The Subnet instance the shown network was opened through, if any. */
export function shownInstance(doc: SceneDoc, path: readonly Crumb[]) {
  const p = fullPath(doc, path);
  const last = p.at(-1)!, parent = p.at(-2);
  return last.node && parent ? { network: parent.network, node: last.node } : undefined;
}

/**
 * Comp settings to view a network with: its own comp, else the root comp's frame size and rate
 * with the length of the instance it was opened through.
 */
export function viewComp(doc: SceneDoc, path: readonly Crumb[]) {
  const net = shownNetwork(doc, path);
  if (net.comp) return net.comp;
  const root = doc.networks.find((n) => n.id === doc.root)!.comp!;
  return { ...root, duration: networkSpan(doc, net.id, shownInstance(doc, path)) || root.duration };
}

/** Seconds from the shown network's time to its parent's: the instance's in point. */
export function instanceOffset(doc: SceneDoc, crumb: Crumb, parent: Crumb | undefined): number {
  if (!crumb.node || !parent) return 0;
  return doc.networks.find((n) => n.id === parent.network)?.nodes.find((n) => n.id === crumb.node)?.timing?.in ?? 0;
}

export { useUi, sameKey, type Crumb, type KeyRef } from "./uiStore";
