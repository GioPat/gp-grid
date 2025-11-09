import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  platform: "neutral",
  dts: true,
  sourcemap: true,
  sourcemapMode: "inline", // Inline source maps for better debugging
  format: ["esm"],
  clean: true,
});
