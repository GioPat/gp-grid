import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { getGpGridAliases, readBenchmarkSource } from "../../scripts/artifact-resolution.js";

const source = readBenchmarkSource();

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  cacheDir: path.resolve(__dirname, `../../node_modules/.vite-gp-grid-${source}`),
  server: {
    port: 5100,
  },
  build: {
    outDir: path.resolve(__dirname, `../../dist/${source}/@gp-grid/react`),
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime"],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "@bench", replacement: path.resolve(__dirname, "../../src") },
      ...getGpGridAliases(source),
    ],
  },
});
