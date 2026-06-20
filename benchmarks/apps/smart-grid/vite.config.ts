import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  cacheDir: path.resolve(__dirname, "../../node_modules/.vite-smart-grid"),
  server: {
    port: 5104,
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/smart-grid"),
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "smart-webcomponents-react/grid",
    ],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@bench": path.resolve(__dirname, "../../src"),
    },
  },
});
