import { defineConfig } from "tsdown";
import { mkdirSync, writeFileSync } from "node:fs";
import { bundle as bundleCss } from "lightningcss";
import { writeSortWorkerModule } from "./scripts/build-worker.ts";

const STYLES_ENTRY = "src/styles/index.css";
const STYLES_OUTPUT = "dist/styles.css";

/** Bundle src/styles/*.css (via @import) into a single dist/styles.css. */
const buildStyles = (minify: boolean): void => {
  const { code } = bundleCss({ filename: STYLES_ENTRY, minify });
  mkdirSync("dist", { recursive: true });
  writeFileSync(STYLES_OUTPUT, code);
  console.log(`✓ ${STYLES_OUTPUT} written (${minify ? "minified" : "readable"})`);
};

export default defineConfig((cli) => {
  const minify = Boolean(cli.minify) && cli.minify !== "dce-only";
  return {
    entry: "src/index.ts",
    dts: true,
    platform: "neutral",
    hooks: {
      "build:prepare": async () => {
        await writeSortWorkerModule();
      },
    },
    onSuccess: () => buildStyles(minify),
  };
});
