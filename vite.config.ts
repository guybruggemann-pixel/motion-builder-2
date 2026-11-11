import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: dir("./src/app"),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@core": dir("./src/core"), "@": dir("./src/app") } },
  server: { port: 5173, strictPort: true },
  build: { outDir: dir("./dist"), emptyOutDir: true },
});
