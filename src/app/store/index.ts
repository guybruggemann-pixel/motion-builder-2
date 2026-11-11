import { useStore } from "zustand";
import { lowerThird, type SceneDoc } from "@core/scene";
import { createDocStore, type DocState } from "./docStore";

/** The app's one doc store. Starts on the reference lower third until file open lands. */
export const docStore = createDocStore(lowerThird);
export const useDocStore = <T,>(pick: (s: DocState) => T): T => useStore(docStore, pick);

/** The network shown in the viewer: the last opened subnet, else the root comp. */
export function shownNetwork(doc: SceneDoc, path: readonly string[]) {
  const id = path[path.length - 1] ?? doc.root;
  return doc.networks.find((n) => n.id === id) ?? doc.networks.find((n) => n.id === doc.root)!;
}

/** Comp settings to view a network with: its own, else the root comp's. */
export function viewComp(doc: SceneDoc, path: readonly string[]) {
  return shownNetwork(doc, path).comp ?? doc.networks.find((n) => n.id === doc.root)!.comp!;
}

export { useUi } from "./uiStore";
