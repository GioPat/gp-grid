import fs from "fs";
import path from "path";
import { gzipSync } from "zlib";
import { fileURLToPath } from "url";
import { build } from "vite";
import { collectArtifactProvenance, getGpGridAliases, readBenchmarkSource } from "./artifact-resolution.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCHMARKS_ROOT = path.join(__dirname, "..");
const NODE_MODULES = path.join(BENCHMARKS_ROOT, "node_modules");

// Keep these entries aligned with the package imports in each benchmark's
// GridWrapper. Re-exporting the runtime values makes Vite retain the same grid
// features while tree-shaking exports that the benchmark does not exercise.
const PACKAGE_ENTRY_SOURCES = {
  "gp-grid": `
    export { Grid, createClientDataSource } from "@gp-grid/react";
    import "@gp-grid/react/dist/styles.css";
  `,
  "gp-grid-server-grouping": `
    export { Grid } from "@gp-grid/react";
    export { createServerGroupingSource } from "@gp-grid/core";
    import "@gp-grid/react/dist/styles.css";
  `,
  "ag-grid": `
    export { AgGridReact } from "ag-grid-react";
    export { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
  `,
  "tanstack-table": `
    export {
      useTable,
      tableFeatures,
      columnFilteringFeature,
      rowSortingFeature,
      columnSizingFeature,
      createFilteredRowModel,
      createSortedRowModel,
    } from "@tanstack/react-table";
    export { useVirtualizer } from "@tanstack/react-virtual";
  `,
  handsontable: `
    export { default as Handsontable } from "handsontable";
    import "handsontable/styles/handsontable.min.css";
    import "handsontable/styles/ht-theme-main.min.css";
  `,
  "smart-grid": `
    export { Grid, Smart } from "smart-webcomponents-react/grid";
    import "smart-webcomponents-react/source/styles/smart.default.css";
  `,
};

// Both gp-grid entries resolve to the benchmark source's artifacts.
const GP_GRID_ENTRIES = new Set(["gp-grid", "gp-grid-server-grouping"]);

// Measured beside "gp-grid" from candidate artifacts only: the published packages
// predate server grouping.
const CANDIDATE_COMPANIONS = { "gp-grid": ["gp-grid-server-grouping"] };

// PRD 008 D12, PRD 009 D7 and PRD 012 D8: no gp-grid entry may keep the local
// grouping or pivot engine. Each marker is its engine's RangeError text, which
// only that engine's folder holds; "gp-group:" lives in the shared ids.
const ENGINE_MARKER = "Invalid rowGrouping.";
const PIVOT_ENGINE_MARKER = "Invalid pivot.";
const GP_GRID_ENGINE_MARKERS = [ENGINE_MARKER, PIVOT_ENGINE_MARKER];

export const assertConsumerHoldsNoEngine = (grid, contents, markers) => {
  const found = markers.find((marker) => contents.some((content) => content.includes(marker)));
  if (found !== undefined) {
    throw new Error(`The ${grid} package-size bundle contains an engine ("${found}").`);
  }
};

const isReactPeer = (source) => {
  return source === "react" ||
    source.startsWith("react/") ||
    source === "react-dom" ||
    source.startsWith("react-dom/");
};

const packageEntryPlugin = (grid, source) => {
  const entryId = `virtual:benchmark-package-size-${grid}`;
  const resolvedEntryId = `\0${entryId}`;

  return {
    name: `benchmark-package-size-${grid}`,
    resolveId(id) {
      return id === entryId ? resolvedEntryId : null;
    },
    load(id) {
      return id === resolvedEntryId ? source : null;
    },
  };
};

const outputContents = (buildResult) => {
  const results = Array.isArray(buildResult) ? buildResult : [buildResult];
  const contents = [];

  for (const result of results) {
    for (const output of result.output) {
      if (output.type === "chunk") {
        contents.push(Buffer.from(output.code));
        continue;
      }

      if (path.extname(output.fileName) === ".css") {
        contents.push(Buffer.from(output.source));
      }
    }
  }

  return contents;
};

const measurePackageGroup = async (grid, source, benchmarkSource) => {
  const buildResult = await build({
    configFile: false,
    root: BENCHMARKS_ROOT,
    logLevel: "silent",
    plugins: [packageEntryPlugin(grid, source)],
    resolve: {
      alias: GP_GRID_ENTRIES.has(grid) ? getGpGridAliases(benchmarkSource) : [],
      dedupe: ["react", "react-dom"],
    },
    build: {
      write: false,
      minify: true,
      cssMinify: true,
      rollupOptions: {
        input: `virtual:benchmark-package-size-${grid}`,
        external: isReactPeer,
        preserveEntrySignatures: "strict",
        output: {
          format: "es",
        },
      },
    },
  });
  const contents = outputContents(buildResult);
  if (GP_GRID_ENTRIES.has(grid)) assertConsumerHoldsNoEngine(grid, contents, GP_GRID_ENGINE_MARKERS);

  return {
    minifiedBytes: contents.reduce((total, content) => total + content.length, 0),
    gzipBytes: contents.reduce(
      (total, content) => total + gzipSync(content).length,
      0,
    ),
  };
};

// Resolved version straight from the installed package manifest, so the run
// records exactly which artifact was sized.
const readMeasuredVersion = (packageName) => {
  const manifestPath = path.join(NODE_MODULES, packageName, "package.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf-8")).version;
};

const measureEntry = async (grid, packages, artifactProvenance, benchmarkSource) => {
  const source = PACKAGE_ENTRY_SOURCES[grid];
  if (source === undefined) {
    throw new Error(`No package-size entry is configured for ${grid}.`);
  }

  return {
    packages,
    versions: Object.fromEntries(
      packages.map((pkg) => {
        const artifact = artifactProvenance.packages.find((item) => item.name === pkg);
        return [pkg, artifact?.version ?? readMeasuredVersion(pkg)];
      }),
    ),
    source: GP_GRID_ENTRIES.has(grid) ? benchmarkSource : "published",
    ...(await measurePackageGroup(grid, source, benchmarkSource)),
  };
};

export const collectPackageSizes = async (gridPackages, benchmarkSource = readBenchmarkSource()) => {
  const sizes = {};
  const artifactProvenance = collectArtifactProvenance(benchmarkSource);

  for (const [grid, packages] of Object.entries(gridPackages)) {
    sizes[grid] = await measureEntry(grid, packages, artifactProvenance, benchmarkSource);
    if (benchmarkSource !== "candidate") continue;
    for (const companion of CANDIDATE_COMPANIONS[grid] ?? []) {
      sizes[companion] = await measureEntry(companion, packages, artifactProvenance, benchmarkSource);
    }
  }

  return sizes;
};
