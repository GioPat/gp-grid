import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  cacheDir: path.resolve(__dirname, "../../node_modules/.vite-handsontable"),
  server: {
    port: 5103,
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/handsontable"),
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "handsontable"],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@bench": path.resolve(__dirname, "../../src"),
    },
  },
});
