import fs from "fs";
import path from "path";
import { gzipSync } from "zlib";
import { fileURLToPath } from "url";
import { build } from "vite";

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

const measurePackageGroup = async (grid, source) => {
  const buildResult = await build({
    configFile: false,
    root: BENCHMARKS_ROOT,
    logLevel: "silent",
    plugins: [packageEntryPlugin(grid, source)],
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

export const collectPackageSizes = async (gridPackages) => {
  const sizes = {};

  for (const [grid, packages] of Object.entries(gridPackages)) {
    const source = PACKAGE_ENTRY_SOURCES[grid];
    if (source === undefined) {
      throw new Error(`No package-size entry is configured for ${grid}.`);
    }

    sizes[grid] = {
      packages,
      versions: Object.fromEntries(
        packages.map((pkg) => [pkg, readMeasuredVersion(pkg)]),
      ),
      ...(await measurePackageGroup(grid, source)),
    };
  }

  return sizes;
};
