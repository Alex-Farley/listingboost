import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r("./apps/web/client"),
  plugins: [react()],
  resolve: { alias: { "@listingboost/domain": r("./packages/domain/src/index.ts") } },
  build: { outDir: r("./dist/client"), emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
