import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const STYLES_SRC = "../core/dist/styles.css";
const stripSourcemaps = process.argv.includes("--strip-sourcemaps");

copyFileSync(STYLES_SRC, "dist/styles.css");

mkdirSync("dist/angular/dist", { recursive: true });
copyFileSync(STYLES_SRC, "dist/angular/dist/styles.css");

if (stripSourcemaps) {
  const fesmDir = "dist/angular/fesm2022";
  for (const file of readdirSync(fesmDir)) {
    if (file.endsWith(".map")) rmSync(join(fesmDir, file));
  }
  console.log("✓ styles.css copied, sourcemaps stripped");
} else {
  console.log("✓ styles.css copied");
}
