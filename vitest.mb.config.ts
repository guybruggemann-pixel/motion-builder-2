// Motion Builder's own test suite (engine, parity, edits, exports). Run: bunx vitest run -c vitest.mb.config.ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: { include: ["test/**/*.test.ts"] },
});
