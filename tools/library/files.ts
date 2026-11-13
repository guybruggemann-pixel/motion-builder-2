/** Reads library packages from disk for the pure checks in `src/core/library`. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkPackage, type LibraryPackage } from "../../src/core/library";

export interface Scan {
  packages: LibraryPackage[];
  /** Folder → what's wrong with it. */
  problems: { folder: string; errors: string[] }[];
}

const json = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

/** Every package folder under `dir` and `dir/_inbox` (a folder with an asset.json). */
export function scanLibrary(dir: string): Scan {
  const scan: Scan = { packages: [], problems: [] };
  for (const base of [dir, join(dir, "_inbox")]) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base).sort()) {
      const folder = join(base, name);
      if (name.startsWith("_") || name.startsWith(".") || !statSync(folder).isDirectory() || !existsSync(join(folder, "asset.json"))) continue;
      try {
        if (!existsSync(join(folder, "doc.json"))) {
          scan.problems.push({ folder, errors: ["no doc.json yet (run the importer, or save the asset from the app)"] });
          continue;
        }
        const r = checkPackage(name, json(join(folder, "asset.json")), json(join(folder, "doc.json")));
        if (r.ok) scan.packages.push(r.package);
        else scan.problems.push({ folder, errors: r.errors });
      } catch (e) {
        scan.problems.push({ folder, errors: [(e as Error).message] });
      }
    }
  }
  return scan;
}
