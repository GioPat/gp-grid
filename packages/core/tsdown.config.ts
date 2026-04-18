import { defineConfig } from "tsdown";
import { writeFileSync } from "node:fs";

export default defineConfig({
  entry: "src/index.ts",
  dts: true,
  platform: "neutral",
  onSuccess: async () => {
    const cacheBuster = `?t=${Date.now()}`;
    const { gridStyles } = await import(`./dist/index.js${cacheBuster}`);
    writeFileSync("dist/styles.css", gridStyles, "utf-8");
    console.log("✓ dist/styles.css written");
  },
});
