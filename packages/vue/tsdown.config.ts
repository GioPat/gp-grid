import { defineConfig } from "tsdown";
import Vue from "unplugin-vue/rolldown";

export default defineConfig({
  entry: ["./src/index.ts"],
  platform: "neutral",
  dts: { vue: true },
  format: ["esm"],
  clean: true,
  external: ["vue"],
  plugins: [Vue({ isProduction: true })],
});
