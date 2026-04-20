import { defineConfig } from "tsdown";
import { copyFileSync } from "node:fs";

export default defineConfig({
  entry: ["./src/index.ts"],
  platform: "neutral",
  dts: true,
  format: ["esm"],
  clean: true,
  external: ["react", "react-dom", "react/jsx-runtime"],
  onSuccess: () => {
    copyFileSync("../core/dist/styles.css", "dist/styles.css");
    console.log("✓ dist/styles.css copied");
  },
});
