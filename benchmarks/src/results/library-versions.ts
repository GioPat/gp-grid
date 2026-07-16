import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { GRIDS, type GridType, type GridLibraryVersion } from "../data/types";
// Node ESM loader requires the import attribute (this runs under Playwright/Node,
// not Vite).
import gridPackages from "../config/grid-packages.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// benchmarks/ root — two levels up from src/results.
const BENCHMARKS_ROOT = path.join(__dirname, "../..");
const NODE_MODULES = path.join(BENCHMARKS_ROOT, "node_modules");

const GRID_PACKAGES: Record<GridType, string[]> = gridPackages;

// Read the resolved version straight from the installed package manifest rather
// than the declared range, so the record captures exactly what ran.
const readPackageVersion = (packageName: string): string => {
  try {
    const manifestPath = path.join(NODE_MODULES, packageName, "package.json");
    const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      version?: string;
    };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
};

const buildEntry = (grid: GridType): GridLibraryVersion => {
  const packages: Record<string, string> = {};
  for (const name of GRID_PACKAGES[grid]) {
    packages[name] = readPackageVersion(name);
  }

  return { packages };
};

export const collectLibraryVersions = (): Record<
  GridType,
  GridLibraryVersion
> => {
  return GRIDS.reduce(
    (acc, grid) => {
      acc[grid] = buildEntry(grid);
      return acc;
    },
    {} as Record<GridType, GridLibraryVersion>,
  );
};
