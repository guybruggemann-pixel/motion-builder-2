import { applyRow } from "@core/batch";
import { validateDoc, type SceneDoc } from "@core/scene";
import type { HeadlessOptions } from "./types";

/** The doc as it will render: valid, with the overrides on their instance. */
export function prepareDoc(input: unknown, options: Pick<HeadlessOptions, "overrides">): SceneDoc {
  const r = validateDoc(input);
  if (!r.ok) throw new Error(`The doc isn't valid:\n${r.errors.join("\n")}`);
  const o = options.overrides;
  if (!o) return r.doc;
  return applyRow(r.doc, { network: o.network, instance: o.instance, mapping: Object.fromEntries(Object.keys(o.values).map((k) => [k, k])) }, o.values);
}
