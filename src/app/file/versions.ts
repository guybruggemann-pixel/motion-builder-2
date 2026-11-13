/**
 * Comp versions, AE style (CLAUDE.md): "Save as new version" duplicates the root comp as
 * `Name_v02` with `versionOf` pointing at the comp it came from, and makes it the root.
 * Older versions stay in the doc and can be switched back to. Plain immer recipes.
 */
import type { Draft } from "immer";
import type { SceneDoc } from "@core/scene";

const VERSION = /^(.*?)_v(\d+)$/;

/** "Main_v01" → "Main"; "Main" → "Main". */
export const baseName = (name: string) => VERSION.exec(name)?.[1] ?? name;

/** Comps connected by versionOf belong to one family; names alone aren't identity. */
export function versionsOf(doc: SceneDoc, id: string) {
  const net = doc.networks.find((n) => n.id === id);
  if (!net?.comp) return [];
  const origin = (start: string) => {
    let current = start;
    const seen = new Set<string>();
    while (!seen.has(current)) {
      seen.add(current);
      const parent = doc.networks.find((n) => n.id === current)?.versionOf;
      if (!parent || !doc.networks.some((n) => n.id === parent)) break;
      current = parent;
    }
    return current;
  };
  const family = origin(id);
  const num = (n: string) => Number(VERSION.exec(n)?.[2] ?? 0);
  return doc.networks.filter((n) => n.comp && origin(n.id) === family).sort((a, b) => num(a.name) - num(b.name));
}

/** Next free `_vNN` name in the family: highest version + 1, at least two digits. */
export function nextVersionName(doc: SceneDoc, id: string): string {
  const fam = versionsOf(doc, id);
  const base = baseName(doc.networks.find((n) => n.id === id)?.name ?? id);
  const top = Math.max(1, ...fam.map((n) => Number(VERSION.exec(n.name)?.[2] ?? 1)));
  let next = top + 1;
  while (doc.networks.some((n) => n.name === `${base}_v${String(next).padStart(2, "0")}`)) next++;
  return `${base}_v${String(next).padStart(2, "0")}`;
}

/** Duplicate the root comp as the next version and make it the root. */
export function saveAsNewVersion(d: Draft<SceneDoc>) {
  const doc = d as unknown as SceneDoc;
  const src = doc.networks.find((n) => n.id === doc.root);
  if (!src?.comp) return;
  const name = nextVersionName(doc, src.id);
  const allocate = (label: string, reserved: string[] = []) => {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const base = (/^[a-z]/.test(slug) ? slug : `comp-${slug}`).slice(0, 54);
    let candidate = base, i = 2;
    while (doc.networks.some((n) => n.id === candidate) || reserved.includes(candidate)) candidate = `${base}-${i++}`;
    return candidate;
  };
  const id = allocate(name);
  // Snapshot the whole reachable network tree; assets remain shared immutable resources.
  const ids = new Map<string, string>([[src.id, id]]);
  const originals = new Map<string, SceneDoc["networks"][number]>();
  const visit = (netId: string) => {
    if (originals.has(netId)) return;
    const net = doc.networks.find((n) => n.id === netId);
    if (!net) return;
    originals.set(netId, net);
    for (const node of net.nodes) if (node.subnet) {
      if (!ids.has(node.subnet)) {
        const childId = allocate(`${id}-${node.subnet}`, [...ids.values()]);
        ids.set(node.subnet, childId);
      }
      visit(node.subnet);
    }
  };
  visit(src.id);
  for (const net of originals.values()) {
    const copy: SceneDoc["networks"][number] = JSON.parse(JSON.stringify(net));
    const newId = ids.get(net.id);
    if (!newId) continue;
    copy.id = newId;
    if (net.id === src.id) { copy.name = name; copy.versionOf = src.id; }
    else delete copy.versionOf;
    for (const node of copy.nodes) if (node.subnet) node.subnet = ids.get(node.subnet) ?? node.subnet;
    d.networks.push(copy);
  }
  d.root = id;
}

/** Switch the active composition; only networks with comp settings may become the root. */
export function switchComp(d: Draft<SceneDoc>, id: string) {
  if (d.networks.some((n) => n.id === id && n.comp)) d.root = id;
}

/** Open another version of the root comp. */
export function switchVersion(d: Draft<SceneDoc>, id: string) {
  const doc = d as unknown as SceneDoc;
  if (versionsOf(doc, doc.root).some((n) => n.id === id)) d.root = id;
}
