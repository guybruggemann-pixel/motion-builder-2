/** `bun run library:index [dir]`: checks every package and writes <dir>/index.json (default: library/). */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildIndex } from "../../src/core/library";
import { scanLibrary } from "./files";

const dir = process.argv[2] ?? "library";
const { packages, problems } = scanLibrary(dir);
writeFileSync(join(dir, "index.json"), `${JSON.stringify(buildIndex(packages), null, 1)}\n`);
console.log(`${join(dir, "index.json")}: ${packages.length} package${packages.length === 1 ? "" : "s"}`);
for (const p of problems) console.error(`\nNot in the index: ${p.folder}\n${p.errors.map((e) => `  - ${e}`).join("\n")}`);
if (problems.length) process.exit(1);
