/**
 * Doc upgrades, oldest first. `validateDoc` runs `migrate` before it checks anything, so a doc
 * saved by an older version opens as the current one. Each step is pure: object in, object out.
 */
import { DOC_VERSION } from "./schema";

type Raw = Record<string, unknown>;

const STEPS: Record<number, (d: Raw) => Raw> = {
  /** v2 -> v3: batches (data-driven renders) added; old docs have none. */
  2: (d) => ({ ...d, version: 3, batches: [] }),
};

/** Upgrade a raw doc to the current version. Unknown shapes are returned as-is for validation to reject. */
export function migrate(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  let d = input as Raw;
  while (typeof d.version === "number" && d.version < DOC_VERSION && STEPS[d.version]) d = STEPS[d.version]!(d);
  return d;
}
