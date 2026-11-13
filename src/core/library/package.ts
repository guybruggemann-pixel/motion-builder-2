/**
 * Checks a library package (asset.json + doc.json) and builds the library index. Pure: reading
 * folders is the caller's job (`tools/library/`), so this runs in tests, workers and the app.
 */
import { validateDoc, type Network, type SceneDoc } from "../scene";
import { AssetMeta } from "./asset";

export interface LibraryPackage {
  meta: AssetMeta;
  doc: SceneDoc;
  /** The asset itself: the network the root comp's one Subnet opens into. */
  asset: Network;
}

export type PackageResult = { ok: true; package: LibraryPackage } | { ok: false; errors: string[] };

/**
 * The network of the single Subnet that is the root comp's output, or why there isn't one.
 * Inserting an asset is always "add one Subnet node", so a package must have this shape.
 */
export function assetNetwork(doc: SceneDoc): { network: Network; instance: string } | { error: string } {
  const root = doc.networks.find((n) => n.id === doc.root)!;
  const out = root.nodes.find((n) => n.id === root.output);
  const feeding = (id: string) => root.wires.filter((w) => w.to.node === id && w.to.port === "in").map((w) => root.nodes.find((n) => n.id === w.from.node)!);
  let layers = out ? (out.type === "Output" ? feeding(out.id) : [out]) : [];
  if (layers.length === 1 && layers[0]!.type === "Merge") layers = feeding(layers[0]!.id);
  if (layers.length !== 1 || layers[0]!.type !== "Subnet") return { error: `the root comp must output exactly one Subnet (the asset); it outputs ${layers.length ? layers.map((l) => l.type).join(", ") : "nothing"}` };
  const network = doc.networks.find((n) => n.id === layers[0]!.subnet);
  if (!network) return { error: "the asset Subnet doesn't open into a network" };
  return { network, instance: layers[0]!.id };
}

/** Validates both files and how they fit together. `folder` is the package's folder name. */
export function checkPackage(folder: string, assetJson: unknown, docJson: unknown): PackageResult {
  const errors: string[] = [];
  const meta = AssetMeta.safeParse(assetJson);
  if (!meta.success) errors.push(...meta.error.issues.map((i) => `asset.json ${i.path.join(".") || "(root)"}: ${i.message}`));
  const doc = validateDoc(docJson);
  if (!doc.ok) errors.push(...doc.errors.map((e) => `doc.json: ${e}`));
  if (!meta.success || !doc.ok) return { ok: false, errors };
  if (meta.data.id !== folder) errors.push(`asset.json id "${meta.data.id}" must be the folder name "${folder}"`);
  const asset = assetNetwork(doc.doc);
  if ("error" in asset) return { ok: false, errors: [...errors, `doc.json: ${asset.error}`] };
  const promoted = new Set((asset.network.promoted ?? []).map((p) => p.id));
  for (const c of meta.data.controls) if (!promoted.has(c)) errors.push(`asset.json controls: "${c}" isn't a promoted control of "${asset.network.id}" (it has: ${[...promoted].join(", ") || "none"})`);
  const has3d = doc.doc.networks.some((n) => n.nodes.some((x) => x.type === "Scene3D"));
  if (meta.data.dimension === "2d" && has3d) errors.push('asset.json dimension is "2d" but the doc has a 3D scene');
  if (meta.data.dimension === "3d" && !has3d) errors.push('asset.json dimension is "3d" but the doc has no 3D scene');
  return errors.length ? { ok: false, errors } : { ok: true, package: { meta: meta.data, doc: doc.doc, asset: asset.network } };
}

/** One line of `library/index.json`: enough to browse, filter and retrieve without opening packages. */
export interface IndexEntry {
  id: string;
  name: string;
  category: AssetMeta["category"];
  dimension: AssetMeta["dimension"];
  tags: string[];
  description: string;
  grammar: { character: string; structure: string[]; eases: string[]; techniques: string[]; duration: number };
  controls: string[];
  rating?: number;
  status: AssetMeta["status"];
}

export interface LibraryIndex {
  version: 1;
  assets: IndexEntry[];
}

/** The index of a set of packages, sorted by id so the file only changes when the library does. */
export function buildIndex(packages: readonly LibraryPackage[]): LibraryIndex {
  const assets = packages
    .map(({ meta, doc }): IndexEntry => ({
      id: meta.id,
      name: meta.name,
      category: meta.category,
      dimension: meta.dimension,
      tags: meta.tags,
      description: meta.description,
      grammar: { character: meta.grammar.character, structure: meta.grammar.structure, eases: meta.grammar.eases, techniques: meta.grammar.techniques, duration: doc.networks.find((n) => n.id === doc.root)!.comp!.duration },
      controls: meta.controls,
      ...(meta.quality ? { rating: meta.quality.rating } : {}),
      status: meta.status,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { version: 1, assets };
}
