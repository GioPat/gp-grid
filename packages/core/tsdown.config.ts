import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  sourcemap: true,
  minify: true,
  dts: true,
  platform: "neutral",
});
