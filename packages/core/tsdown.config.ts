import { defineConfig } from "tsdown";
import { mkdirSync, writeFileSync } from "node:fs";
import { writeSortWorkerModule } from "./scripts/build-worker.ts";
import { bundleStyles, writeStylesModule } from "./scripts/build-styles.ts";

const STYLES_OUTPUT = "dist/styles.css";

const buildStyles = (minify: boolean): void => {
  mkdirSync("dist", { recursive: true });
  writeFileSync(STYLES_OUTPUT, bundleStyles(minify));
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
        writeStylesModule();
      },
    },
    onSuccess: () => buildStyles(minify),
  };
});
