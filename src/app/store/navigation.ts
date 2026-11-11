/** Opening subnets and going back up, keeping the playhead on the same moment in time. */
import type { Node } from "@core/scene";
import { docStore, fullPath, instanceOffset, viewComp } from "./index";
import { useUi, type Crumb } from "./uiStore";

function secondsAtRoot(path: Crumb[], seconds: number) {
  const doc = docStore.getState().doc;
  const p = fullPath(doc, path);
  for (let i = p.length - 1; i > 0; i--) seconds += instanceOffset(doc, p[i]!, p[i - 1]);
  return seconds;
}

function goTo(path: Crumb[], rootSeconds: number) {
  const doc = docStore.getState().doc;
  const p = fullPath(doc, path);
  let s = rootSeconds;
  for (let i = 1; i < p.length; i++) s -= instanceOffset(doc, p[i]!, p[i - 1]);
  useUi.getState().setPath(path, Math.max(0, s) * viewComp(doc, path).fps);
}

const nowAtRoot = () => {
  const { path, frame } = useUi.getState();
  return secondsAtRoot(path, frame / viewComp(docStore.getState().doc, path).fps);
};

/** Dive into a Subnet node of the shown network. */
export function openSubnet(node: Node) {
  if (!node.subnet) return;
  const { path } = useUi.getState();
  goTo([...path, { network: node.subnet, node: node.id }], nowAtRoot());
}

/** Go up to crumb `depth` (0 = root comp). */
export function openDepth(depth: number) {
  const { path } = useUi.getState();
  goTo(path.slice(0, depth), nowAtRoot());
}
