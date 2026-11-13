/**
 * `bun run render:check [doc.json …]`: renders the same frames in the background (headless) and in
 * a real browser window, and reports how far apart they are. Headless output is only trusted
 * while this passes. With no docs given it checks the built-in examples (2D, 3D text, clones).
 */
import { readFileSync } from "node:fs";
import { frameDiff } from "../../src/app/render/frameDiff";
import { lowerThird } from "../../src/core/scene/examples/lowerThird";
import { title3d } from "../../src/core/scene/examples/title3d";
import { waveWall } from "../../src/core/scene/examples/waveWall";
import { openRenderer } from "./driver";

/** Pass when at most `changed` of the pixels are off by more than `threshold` (of 255) and the mean difference stays under `mean`. Today the renders match exactly; the slack is for other GPUs. */
export const TOLERANCE = { threshold: 8, changed: 0.002, mean: 0.5 };

const SIZE = { width: 960, height: 540 };

async function main() {
  const args = process.argv.slice(2);
  const url = args.includes("--url") ? args[args.indexOf("--url") + 1] : undefined;
  const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--url");
  const docs: [string, unknown][] = files.length ? files.map((f) => [f, JSON.parse(readFileSync(f, "utf8"))]) : [["lowerThird (2D)", lowerThird], ["title3d (3D text)", title3d], ["waveWall (clones)", waveWall()]];

  const headless = await openRenderer({ url });
  const headed = await openRenderer({ url, headed: true });
  console.log(`A: ${headless.browser}\nB: ${headed.browser}\n`);
  let failed = 0;
  try {
    for (const [name, doc] of docs) {
      const a = await headless.render(doc, { format: "frames", ...SIZE });
      const b = await headed.render(doc, { format: "frames", ...SIZE });
      const size = a.meta.width * a.meta.height * 4;
      let worst = { frame: 0, max: 0, mean: 0, changed: 0 };
      for (let i = 0; i < a.meta.frames; i++) {
        const d = frameDiff(new Uint8ClampedArray(a.bytes.buffer, i * size, size), new Uint8ClampedArray(b.bytes.buffer, i * size, size), TOLERANCE.threshold);
        if (d.changed > worst.changed || (d.changed === worst.changed && d.mean > worst.mean)) worst = { frame: i, ...d };
      }
      const ok = a.meta.frames === b.meta.frames && worst.changed <= TOLERANCE.changed && worst.mean <= TOLERANCE.mean;
      if (!ok) failed++;
      console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${a.meta.frames} frames; worst frame ${worst.frame}: ${(worst.changed * 100).toFixed(3)}% of pixels differ, mean ${worst.mean.toFixed(3)}, max ${worst.max}`);
    }
  } finally {
    await headless.close();
    await headed.close();
  }
  if (failed) {
    console.error(`\n${failed} of ${docs.length} differ more than the tolerance (${TOLERANCE.changed * 100}% of pixels over ${TOLERANCE.threshold}/255, mean ${TOLERANCE.mean}).`);
    process.exit(1);
  }
  console.log("\nHeadless and browser renders match.");
}

main().catch((e: Error) => {
  console.error(`render:check: ${e.message}`);
  process.exit(1);
});
