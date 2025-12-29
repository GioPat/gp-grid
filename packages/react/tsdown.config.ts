import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  platform: "neutral",
  dts: true,
  format: ["esm"],
  clean: true,
  external: ["react", "react-dom", "react/jsx-runtime"],
});
