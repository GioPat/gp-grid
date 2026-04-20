import { defineConfig } from "tsdown";
import Vue from "unplugin-vue/rolldown";
import { copyFileSync } from "node:fs";

export default defineConfig({
  entry: ["./src/index.ts"],
  platform: "neutral",
  dts: { vue: true },
  format: ["esm"],
  clean: true,
  external: ["vue"],
  plugins: [Vue({ isProduction: true })],
  onSuccess: () => {
    copyFileSync("../core/dist/styles.css", "dist/styles.css");
    console.log("✓ dist/styles.css copied");
  },
});
