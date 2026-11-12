/**
 * What an AE passes export writes, decided from the doc alone (pure): one element per top-level
 * layer of the comp (paint order, bottom first) plus one per 3D object inside its 3D scene layers,
 * and the files: a beauty per layer, a matte per element, puzzle files of three, depth per 3D scene.
 */
import { layerOrder, type SceneDoc } from "@core/scene";

export interface PassOptions {
  mattes: boolean;
  puzzle: boolean;
  depth: boolean;
}

export interface PassElement {
  /** Unique within the export. */
  id: string;
  name: string;
  kind: "layer" | "object";
  /** The layer node in the comp, or the 3D object node inside its scene's network. */
  node: string;
  /** For objects: the 3D scene layer they're drawn in. */
  scene?: string;
  in: number;
  out: number;
}

export interface PassOutput {
  file: string;
  kind: "beauty" | "matte" | "puzzle" | "depth";
  name: string;
  /** beauty / matte: the element; depth: the scene layer. */
  element?: string;
  /** puzzle: element ids in R, G, B. */
  channels?: string[];
  in: number;
  out: number;
  /** depth: the view depth range mapped to white (near) .. black (far), in px. */
  near?: number;
  far?: number;
}

export interface PassPlan {
  comp: { id: string; name: string; width: number; height: number; fps: number; duration: number; frames: number; background?: string };
  elements: PassElement[];
  outputs: PassOutput[];
}

const safe = (s: string) => s.replace(/[^\w-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "layer";
const turnable = (t: string) => t === "Text3D" || t === "Shape3D";

export function planPasses(doc: SceneDoc, networkId: string, o: PassOptions): PassPlan {
  const net = doc.networks.find((n) => n.id === networkId)!;
  const comp = net.comp ?? doc.networks.find((n) => n.id === doc.root)!.comp!;
  const duration = comp.duration, frames = Math.max(1, Math.round(duration * comp.fps));
  const bg = net.comp?.background;
  const background = bg?.startsWith("brand:") ? doc.brand?.colors.find((c) => c.token === bg.slice(6))?.value : bg;

  const elements: PassElement[] = [];
  const layers = layerOrder(net).wired.filter((n) => n.enabled);
  for (const n of layers) elements.push({ id: n.id, name: n.name, kind: "layer", node: n.id, in: n.timing?.in ?? 0, out: n.timing?.out ?? duration });
  for (const n of layers) {
    if (n.type !== "Scene3D" || !n.subnet) continue;
    const inner = doc.networks.find((x) => x.id === n.subnet);
    for (const obj of inner ? layerOrder(inner).wired.filter((x) => x.enabled && turnable(x.type)) : [])
      elements.push({ id: `${n.id}/${obj.id}`, name: `${n.name} · ${obj.name}`, kind: "object", node: obj.id, scene: n.id, in: n.timing?.in ?? 0, out: n.timing?.out ?? duration });
  }

  const taken = new Set<string>();
  const file = (base: string) => {
    let f = `${base}.mov`, i = 2;
    while (taken.has(f)) f = `${base}_${i++}.mov`;
    taken.add(f);
    return f;
  };
  const prefix = safe(net.name);
  const outputs: PassOutput[] = [];
  for (const e of elements.filter((x) => x.kind === "layer")) outputs.push({ file: file(`${prefix}_${safe(e.name)}`), kind: "beauty", name: e.name, element: e.id, in: e.in, out: e.out });
  if (o.mattes) for (const e of elements) outputs.push({ file: file(`${prefix}_${safe(e.name)}_matte`), kind: "matte", name: `Matte · ${e.name}`, element: e.id, in: e.in, out: e.out });
  // a puzzle channel holds one element: a 3D scene layer whose objects have channels stays out
  const inPuzzle = elements.filter((e) => !(e.kind === "layer" && elements.some((x) => x.scene === e.id)));
  if (o.puzzle)
    inPuzzle.forEach((_, g) => {
      if (g % 3) return;
      const group = inPuzzle.slice(g, g + 3);
      const n = String(g / 3 + 1).padStart(2, "0");
      outputs.push({ file: file(`${prefix}_puzzle_${n}`), kind: "puzzle", name: `Puzzle ${n} · ${group.map((e, i) => `${"RGB"[i]} ${e.name}`).join(" / ")}`, channels: group.map((e) => e.id), in: 0, out: duration });
    });
  if (o.depth)
    for (const e of elements.filter((x) => x.kind === "layer" && layers.find((n) => n.id === x.node)?.type === "Scene3D"))
      outputs.push({ file: file(`${prefix}_${safe(e.name)}_depth`), kind: "depth", name: `Depth · ${e.name}`, element: e.id, in: e.in, out: e.out });

  return { comp: { id: net.id, name: net.name, width: comp.width, height: comp.height, fps: comp.fps, duration, frames, background }, elements, outputs };
}
