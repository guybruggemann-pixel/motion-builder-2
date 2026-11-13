/**
 * `bun run library:import-ae <package folder | ae.json>`: converts source/ae.json (written by
 * tools/ae/mb-export.jsx) into the package's doc.json, and records what couldn't be carried over
 * in asset.json's importNotes and controls when that file exists.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { importAe } from "../../src/core/library";

function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("which package? Give a package folder (with source/ae.json) or an ae.json file");
  const isDir = existsSync(arg) && statSync(arg).isDirectory();
  const source = isDir ? join(arg, "source", "ae.json") : arg;
  if (!existsSync(source)) throw new Error(`${source} doesn't exist`);
  // <package>/source/ae.json → <package>; a loose ae.json → its own folder
  const pkg = isDir ? arg : dirname(resolve(source)).endsWith("/source") ? dirname(dirname(resolve(source))) : dirname(resolve(source));
  const r = importAe(JSON.parse(readFileSync(source, "utf8")));
  writeFileSync(join(pkg, "doc.json"), `${JSON.stringify(r.doc, null, 1)}\n`);
  console.log(`${join(pkg, "doc.json")}: ${r.doc.networks.length} networks, controls: ${r.controls.join(", ") || "none (mark layers with [ctl])"}`);
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
  console.error(`library:import-ae: ${(e as Error).message}`);
  process.exit(1);
}
