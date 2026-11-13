/**
 * `bun run library:import-ae <package folder | ae.json>` and
 * `bun run library:import-c4d <package folder | c4d.json>`: convert a package's source dump
 * (written by tools/ae/mb-export.jsx or tools/c4d/mb_export.py) into its doc.json, and record
 * what couldn't be carried over in asset.json's importNotes and controls when that file exists.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { importAe, importC4d } from "../../src/core/library";

const TOOLS = { ae: { file: "ae.json", run: importAe }, c4d: { file: "c4d.json", run: importC4d } } as const;

function main() {
  const [tool, arg] = process.argv.slice(2) as [keyof typeof TOOLS | undefined, string | undefined];
  if (!tool || !(tool in TOOLS)) throw new Error("say which tool the dump is from: ae or c4d");
  const { file, run } = TOOLS[tool];
  if (!arg) throw new Error(`which package? Give a package folder (with source/${file}) or a ${file} file`);
  const isDir = existsSync(arg) && statSync(arg).isDirectory();
  const source = isDir ? join(arg, "source", file) : arg;
  if (!existsSync(source)) throw new Error(`${source} doesn't exist`);
  // <package>/source/<dump> → <package>; a loose dump → its own folder
  const pkg = isDir ? arg : dirname(resolve(source)).endsWith("/source") ? dirname(dirname(resolve(source))) : dirname(resolve(source));
  const r = (run as (dump: unknown) => ReturnType<typeof importAe>)(JSON.parse(readFileSync(source, "utf8")));
  writeFileSync(join(pkg, "doc.json"), `${JSON.stringify(r.doc, null, 1)}\n`);
  console.log(`${join(pkg, "doc.json")}: ${r.doc.networks.length} networks, controls: ${r.controls.join(", ") || "none"}`);
  const assetFile = join(pkg, "asset.json");
  if (existsSync(assetFile)) {
    const asset = JSON.parse(readFileSync(assetFile, "utf8")) as Record<string, unknown>;
    writeFileSync(assetFile, `${JSON.stringify({ ...asset, controls: r.controls, importNotes: r.notes }, null, 1)}\n`);
    console.log(`${assetFile}: controls and importNotes updated`);
  }
  if (r.notes.length) console.log(`\nNot carried over (${r.notes.length}):\n${r.notes.map((n) => `  - ${n}`).join("\n")}`);
}

try {
  main();
} catch (e) {
  console.error(`library import: ${(e as Error).message}`);
  process.exit(1);
}
