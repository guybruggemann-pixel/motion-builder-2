/**
 * CLAUDE.md architecture rules, enforced: src/core is pure (no UI, renderer, DOM, randomness or
 * wall clock) so it runs in Node, in a worker and in tests, and the same doc + time = same frame.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CORE = fileURLToPath(new URL("../src/core", import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith(".ts") ? [join(dir, f)] : []));

const FORBIDDEN: [RegExp, string][] = [
  [/from\s+["'](react|react-dom|three|zustand|immer|@xyflow\/react)(\/[^"']*)?["']/, "UI or renderer import"],
  [/from\s+["'](@\/|\.\.\/\.\.\/app)/, "import from src/app"],
  [/\bMath\.random\s*\(/, "Math.random (use seeded noise or the Park-Miller shuffle)"],
  [/\b(Date\.now|performance\.now|new Date)\s*\(/, "wall clock"],
  [/\b(document|window|navigator|OffscreenCanvas|HTMLCanvasElement|requestAnimationFrame)\b/, "DOM access"],
];

describe("src/core stays pure", () => {
  it.each(files(CORE).map((f) => [f.slice(CORE.length + 1), f]))("%s", (_, path) => {
    const code = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // ignore comments
    for (const [re, what] of FORBIDDEN) expect(re.test(code), `${what} in ${path}`).toBe(false);
  });
});
