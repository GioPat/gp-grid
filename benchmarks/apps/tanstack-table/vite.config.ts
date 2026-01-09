import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  cacheDir: path.resolve(__dirname, "../../node_modules/.vite-tanstack"),
  server: {
    port: 5102,
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/tanstack-table"),
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@tanstack/react-table",
      "@tanstack/react-virtual",
    ],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@bench": path.resolve(__dirname, "../../src"),
    },
  },
});
