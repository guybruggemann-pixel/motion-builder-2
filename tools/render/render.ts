/** `bun run render <doc.json> …`: a scene doc to MP4, ProRes or PNG frames. See USAGE in args.ts. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs, USAGE } from "./args";
import { openRenderer } from "./driver";
import { encodePng } from "./png";

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const a = parseArgs(argv);
  const doc: unknown = JSON.parse(readFileSync(a.doc, "utf8"));
  const stem = join(dirname(resolve(a.doc)), basename(a.doc, extname(a.doc)));
  const renderer = await openRenderer({ url: a.url, headed: a.headed });
  try {
    let last = 0;
    const { meta, bytes } = await renderer.render(doc, { ...a.options, format: a.format === "png" ? "frames" : a.format }, (done, total) => {
      const pct = Math.floor((done / total) * 10);
      if (pct > last) process.stderr.write(`${(last = pct) * 10}% `);
    });
    if (last) process.stderr.write("\n");
    const from = a.options.from ?? 0;
    if (a.format !== "png") {
      const out = a.out ?? `${stem}.${meta.ext}`;
      mkdirSync(dirname(resolve(out)), { recursive: true });
      writeFileSync(out, bytes);
      console.log(`${out}  ${meta.width}x${meta.height}, ${meta.frames} frames at ${meta.fps} fps, ${(bytes.length / 1e6).toFixed(1)} MB  [${renderer.browser}]`);
      return;
    }
    const size = meta.width * meta.height * 4;
    const png = (i: number) => encodePng(bytes.subarray(i * size, (i + 1) * size), meta.width, meta.height);
    if (a.frame !== undefined) {
      const out = a.out ?? `${stem}_${String(a.frame).padStart(4, "0")}.png`;
      mkdirSync(dirname(resolve(out)), { recursive: true });
      writeFileSync(out, png(0));
      console.log(`${out}  ${meta.width}x${meta.height}, frame ${a.frame}  [${renderer.browser}]`);
      return;
    }
    const dir = a.out ?? `${stem}_frames`;
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < meta.frames; i++) writeFileSync(join(dir, `${basename(stem)}_${String(from + i).padStart(4, "0")}.png`), png(i));
    console.log(`${dir}/  ${meta.frames} PNGs, ${meta.width}x${meta.height}  [${renderer.browser}]`);
  } finally {
    await renderer.close();
  }
}

main().catch((e: Error) => {
  console.error(`render: ${e.message.split("\n").slice(0, 6).join("\n")}`);
  process.exit(1);
});
