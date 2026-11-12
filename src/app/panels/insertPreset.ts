/**
 * Presets go into the open comp, not over it: the preset's main comp becomes a precomp (a Subnet
 * instance) in the shown network, its other networks come along with fresh ids, and its brand
 * colours, fonts and assets join the doc's kit (existing tokens win, so presets take on the
 * project's brand). One undo step; `validateDoc` checks the result.
 */
import type { Draft } from "immer";
import type { SceneDoc } from "@core/scene";
import { wireToOutput } from "@/network/edits";

/** A valid id: lowercase, dashes, starting with a letter ("3D title" -> "p-3d-title"). */
const slug = (s: string) => {
  const b = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "preset";
  return /^[a-z]/.test(b) ? b : `p-${b}`;
};

export function insertPreset(d: Draft<SceneDoc>, intoNet: string, preset: SceneDoc): string {
  const taken = (id: string) => d.networks.some((n) => n.id === id);
  const base = slug(preset.name);
  const map = new Map<string, string>();
  for (const n of preset.networks) {
    let id = `${base}-${n.id}`.slice(0, 60), i = 2;
    while (taken(id) || [...map.values()].includes(id)) id = `${base}-${n.id}-${i++}`.slice(0, 64);
    map.set(n.id, id);
  }
  for (const n of preset.networks) {
    const copy = structuredClone(n) as Draft<SceneDoc>["networks"][number];
    copy.id = map.get(n.id)!;
    for (const node of copy.nodes) if (node.subnet) node.subnet = map.get(node.subnet) ?? node.subnet;
    if (n.id === preset.root) copy.name = preset.name.replace(/\s*\(test\)\s*$/, "");
    d.networks.push(copy);
  }
  // brand kit: add what's missing; the project's own tokens win
  if (preset.brand) {
    d.brand ??= { name: preset.brand.name, colors: [], fonts: [], assets: [] };
    for (const c of preset.brand.colors) if (!d.brand.colors.some((x) => x.token === c.token)) d.brand.colors.push({ ...c });
    for (const f of preset.brand.fonts) if (!d.brand.fonts.some((x) => x.family === f.family)) d.brand.fonts.push(structuredClone(f));
  }
  for (const a of preset.assets) if (!d.assets.some((x) => x.id === a.id)) d.assets.push(structuredClone(a));

  // the instance: a precomp of the preset's main comp, on top, for its own length
  const net = d.networks.find((n) => n.id === intoNet)!;
  const root = preset.networks.find((n) => n.id === preset.root)!;
  let id = slug(root.name === "Main_v01" ? preset.name : root.name).slice(0, 50), i = 2;
  while (net.nodes.some((n) => n.id === id)) id = `${slug(preset.name)}-${i++}`;
  const x = net.nodes.length ? Math.max(...net.nodes.map((n) => n.ui.x)) + 240 : 0;
  net.nodes.push({
    id,
    type: "Subnet",
    name: preset.name.replace(/\s*\(test\)\s*$/, ""),
    enabled: true,
    subnet: map.get(preset.root)!,
    timing: { in: 0, out: root.comp?.duration ?? 5 },
    params: {},
    ui: { x, y: 0 },
  } as Draft<SceneDoc>["networks"][number]["nodes"][number]);
  wireToOutput(d, intoNet, id);
  return id;
}
