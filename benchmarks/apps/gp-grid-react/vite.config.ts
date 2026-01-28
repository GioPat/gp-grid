import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  cacheDir: path.resolve(__dirname, "../../node_modules/.vite-gp-grid"),
  server: {
    port: 5100,
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/@gp-grid/react"),
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime"],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@bench": path.resolve(__dirname, "../../src"),
    },
  },
});
