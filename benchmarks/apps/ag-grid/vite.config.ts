import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  cacheDir: path.resolve(__dirname, "../../node_modules/.vite-ag-grid"),
  server: {
    port: 5101,
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/ag-grid"),
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "ag-grid-react", "ag-grid-community"],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@bench": path.resolve(__dirname, "../../src"),
    },
  },
});
