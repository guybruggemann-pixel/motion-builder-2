/**
 * The one gate every doc passes before it is used: from disk, from the AI, from an importer.
 * Structural checks (zod) first, then catalog checks per node.
 */
import { CATALOG, checkParams, isNodeType, type ParamSpec } from "./catalog";
import { SceneDoc, type Network, type Value } from "./schema";

export type ValidateResult = { ok: true; doc: SceneDoc } | { ok: false; errors: string[] };

/**
 * Param spec of each promoted control of a network, following promotions through nested Subnets.
 * Values set on a Subnet instance under a promoted id are checked against these.
 */
export function promotedSpecs(networks: readonly Network[], netId: string, depth = 0): Record<string, ParamSpec> {
  const net = networks.find((n) => n.id === netId);
  const out: Record<string, ParamSpec> = {};
  if (!net || depth > 32) return out;
  for (const p of net.promoted ?? []) {
    const node = net.nodes.find((x) => x.id === p.target.node);
    if (!node || !isNodeType(node.type)) continue;
    const own: Record<string, ParamSpec> = CATALOG[node.type].params;
    const spec = own[p.target.param] ?? (node.subnet ? promotedSpecs(networks, node.subnet, depth + 1)[p.target.param] : undefined);
    if (spec) out[p.id] = spec;
  }
  return out;
}

export function validateDoc(input: unknown): ValidateResult {
  const parsed = SceneDoc.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "doc"}: ${i.message}`) };
  }
  const doc = parsed.data;
  const errors: string[] = [];
  const tokens = new Set((doc.brand?.colors ?? []).map((c) => c.token));
  const isMissingToken = (v: Value) => typeof v === "string" && v.startsWith("brand:") && !tokens.has(v.slice(6));

  for (const net of doc.networks) {
    for (const node of net.nodes) {
      const promoted = node.subnet ? promotedSpecs(doc.networks, node.subnet) : {};
      errors.push(...checkParams(node, promoted).map((e) => `${net.id}/${e}`));
      if (node.type === "Subnet" && !node.subnet) errors.push(`${net.id}/${node.id}: Subnet node needs a subnet network`);
      if (node.subnet && node.type !== "Subnet") errors.push(`${net.id}/${node.id}: only Subnet nodes can open a network`);
      for (const [name, p] of Object.entries(node.params))
        for (const v of [p.value, ...(p.keys ?? []).map((k) => k.v)])
          if (isMissingToken(v)) errors.push(`${net.id}/${node.id}.${name}: brand colour "${v}" is not in the brand kit`);
    }
    const counts = new Map<string, number>();
    for (const w of net.wires) counts.set(w.to.node, (counts.get(w.to.node) ?? 0) + 1);
    for (const [id, n] of counts) {
      const node = net.nodes.find((x) => x.id === id);
      if (node && isNodeType(node.type) && n > CATALOG[node.type].inputs)
        errors.push(`${net.id}/${id}: ${n} inputs, ${node.type} takes ${CATALOG[node.type].inputs}`);
    }
    const resolved = promotedSpecs(doc.networks, net.id);
    for (const p of net.promoted ?? []) {
      const node = net.nodes.find((x) => x.id === p.target.node);
      if (node && isNodeType(node.type) && !resolved[p.id])
        errors.push(`${net.id}: promoted control ${p.id} targets unknown param ${node.type}.${p.target.param}`);
      if (p.id in CATALOG.Subnet.params)
        errors.push(`${net.id}: promoted control id "${p.id}" clashes with a Subnet transform param`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, doc };
}
