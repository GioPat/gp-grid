import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { collectArtifactProvenance, REPOSITORY_ROOT } from "./artifact-resolution.js";

const importFrom = async (specifier, packageFile) => {
  const requireFromPackage = createRequire(packageFile);
  return import(pathToFileURL(requireFromPackage.resolve(specifier)).href);
};

const columns = [
  { colId: "name", field: "name", headerName: "Name", width: 160, cellDataType: "text" },
];
const rows = [{ id: 1, name: "SSR row" }];
const results = [];

const check = async (name, operation) => {
  try {
    const detail = await operation();
    results.push({ name, status: "passed", detail });
  } catch (error) {
    results.push({ name, status: "failed", detail: error instanceof Error ? error.stack ?? error.message : String(error) });
  }
};

/**
 * Width of the first server-rendered header cell, in CSS px. The
 * deterministic first render resolves the layout against `initialWidth`
 * before any browser measurement exists.
 */
const firstHeaderWidth = (html) => {
  const match = html.match(/gp-grid-header-cell[^>]*style="([^"]*)"/);
  if (match === null) throw new Error("No server-rendered header cell found.");
  const width = /width:\s*([0-9.]+)px/.exec(match[1]);
  if (width === null) throw new Error(`No width in header style: ${match[1]}`);
  return Number.parseFloat(width[1]);
};

const expectWidth = (html, expected, label) => {
  const actual = firstHeaderWidth(html);
  if (Math.abs(actual - expected) > 1) {
    throw new Error(`${label}: expected ${expected}px, rendered ${actual}px`);
  }
  return `${actual}px`;
};

const provenance = collectArtifactProvenance("candidate");
const artifact = (name) => {
  const found = provenance.packages.find((item) => item.name === name);
  if (found === undefined) throw new Error(`Missing ${name} candidate artifact.`);
  return found.entry;
};

const coreArtifact = await import(pathToFileURL(artifact("@gp-grid/core")).href);

// Shared read-only columnar fixture for every wrapper: borrowed ordinary and
// typed arrays plus a derived accessor. No browser globals, no external
// service. Server rendering has no await point for the async source query, so
// the documented server behaviour is the shell only; rows may not be present
// synchronously.
const columnarSource = coreArtifact.createColumnarDataSource({
  rowCount: 2,
  getRowId: (row) => row + 1,
  fields: [
    { field: "id", data: new Int32Array([1, 2]) },
    { field: "name", data: ["SSR column 0", "SSR column 1"] },
    { field: "label", getValue: (row) => `col-${row}` },
  ],
});

await check("core import without browser globals", async () => {
  return `GridCore:${typeof coreArtifact.GridCore}`;
});

await check("core columnar source without browser globals", async () => {
  const value = columnarSource.access.getValue(1, "name");
  if (value !== "SSR column 1") {
    throw new Error(`Unexpected columnar read: ${String(value)}`);
  }
  if (columnarSource.writable !== false) {
    throw new Error("A columnar source must declare itself read-only.");
  }
  return `rowCount=${columnarSource.access.rowCount}, field=${columnarSource.access.getValue(0, "label")}`;
});

await check("React native server render", async () => {
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { Grid } = await import(pathToFileURL(artifact("@gp-grid/react")).href);
  const html = renderToString(React.createElement(Grid, {
    columns,
    rowData: rows,
    rowHeight: 32,
    initialWidth: 500,
    initialHeight: 300,
    getRowId: (row) => row.id,
  }));
  if (html.includes("gp-grid-container") === false) throw new Error("React grid shell was not rendered.");
  return `${html.length} characters`;
});

await check("React columnar server render (shell only)", async () => {
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { Grid } = await import(pathToFileURL(artifact("@gp-grid/react")).href);
  const html = renderToString(React.createElement(Grid, {
    columns,
    dataSource: columnarSource,
    rowHeight: 32,
    initialWidth: 500,
    initialHeight: 300,
  }));
  if (html.includes("gp-grid-container") === false) throw new Error("React columnar grid shell was not rendered.");
  return `${html.length} characters (shell; async rows are not assumed)`;
});

await check("React fit expands the single column to initialWidth", async () => {
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { Grid } = await import(pathToFileURL(artifact("@gp-grid/react")).href);
  const html = renderToString(React.createElement(Grid, {
    columns,
    rowData: rows,
    rowHeight: 32,
    initialWidth: 500,
    initialHeight: 300,
    getRowId: (row) => row.id,
  }));
  return expectWidth(html, 500, "React fit");
});

await check("React fixed keeps the declared 160px column", async () => {
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { Grid } = await import(pathToFileURL(artifact("@gp-grid/react")).href);
  const html = renderToString(React.createElement(Grid, {
    columns,
    rowData: rows,
    rowHeight: 32,
    columnLayout: "fixed",
    initialWidth: 500,
    initialHeight: 300,
    getRowId: (row) => row.id,
  }));
  return expectWidth(html, 160, "React fixed");
});

const vuePackage = path.join(REPOSITORY_ROOT, "playgrounds/vite-vue/package.json");
await check("Vue native server render", async () => {
  const { createSSRApp, h } = await importFrom("vue", vuePackage);
  const { renderToString } = await importFrom("vue/server-renderer", vuePackage);
  const vueArtifact = path.join(REPOSITORY_ROOT, "packages/vue/dist/index.js");
  const { GpGrid } = await import(pathToFileURL(vueArtifact).href);
  const app = createSSRApp({
    render: () => h(GpGrid, { columns, rowData: rows, rowHeight: 32, initialWidth: 500, initialHeight: 300 }),
  });
  const html = await renderToString(app);
  if (html.includes("gp-grid-container") === false) throw new Error("Vue grid shell was not rendered.");
  return `${html.length} characters`;
});

await check("Vue fit expands the single column to initialWidth", async () => {
  const { createSSRApp, h } = await importFrom("vue", vuePackage);
  const { renderToString } = await importFrom("vue/server-renderer", vuePackage);
  const vueArtifact = path.join(REPOSITORY_ROOT, "packages/vue/dist/index.js");
  const { GpGrid } = await import(pathToFileURL(vueArtifact).href);
  const app = createSSRApp({
    render: () => h(GpGrid, { columns, rowData: rows, rowHeight: 32, initialWidth: 500, initialHeight: 300 }),
  });
  return expectWidth(await renderToString(app), 500, "Vue fit");
});

await check("Vue fixed keeps the declared 160px column", async () => {
  const { createSSRApp, h } = await importFrom("vue", vuePackage);
  const { renderToString } = await importFrom("vue/server-renderer", vuePackage);
  const vueArtifact = path.join(REPOSITORY_ROOT, "packages/vue/dist/index.js");
  const { GpGrid } = await import(pathToFileURL(vueArtifact).href);
  const app = createSSRApp({
    render: () => h(GpGrid, {
      columns,
      rowData: rows,
      rowHeight: 32,
      columnLayout: "fixed",
      initialWidth: 500,
      initialHeight: 300,
    }),
  });
  return expectWidth(await renderToString(app), 160, "Vue fixed");
});

await check("Vue columnar server render (shell only)", async () => {
  const { createSSRApp, h } = await importFrom("vue", vuePackage);
  const { renderToString } = await importFrom("vue/server-renderer", vuePackage);
  const vueArtifact = path.join(REPOSITORY_ROOT, "packages/vue/dist/index.js");
  const { GpGrid } = await import(pathToFileURL(vueArtifact).href);
  const app = createSSRApp({
    render: () => h(GpGrid, { columns, dataSource: columnarSource, rowHeight: 32, initialWidth: 500, initialHeight: 300 }),
  });
  const html = await renderToString(app);
  if (html.includes("gp-grid-container") === false) throw new Error("Vue columnar grid shell was not rendered.");
  return `${html.length} characters (shell; async rows are not assumed)`;
});

const angularPackage = path.join(REPOSITORY_ROOT, "playgrounds/angular/package.json");
await check("Angular native server render", async () => {
  await importFrom("@angular/compiler", angularPackage);
  const { Component } = await importFrom("@angular/core", angularPackage);
  const { bootstrapApplication } = await importFrom("@angular/platform-browser", angularPackage);
  const { provideServerRendering, renderApplication } = await importFrom("@angular/platform-server", angularPackage);
  const angularArtifact = path.join(REPOSITORY_ROOT, "packages/angular/dist/angular/fesm2022/gp-grid-angular.mjs");
  const { GpGridComponent } = await import(pathToFileURL(angularArtifact).href);
  class SsrSmokeComponent {}
  Component({
    selector: "app-root",
    standalone: true,
    imports: [GpGridComponent],
    template: '<gp-grid [columns]="columns" [rows]="rows" [rowHeight]="32" />',
  })(SsrSmokeComponent);
  SsrSmokeComponent.prototype.columns = columns;
  SsrSmokeComponent.prototype.rows = rows;
  const html = await renderApplication(
    (context) => bootstrapApplication(SsrSmokeComponent, { providers: [provideServerRendering()] }, context),
    { document: "<!doctype html><html><body><app-root></app-root></body></html>" },
  );
  if (html.includes("gp-grid-container") === false) throw new Error("Angular grid shell was not rendered.");
  return `${html.length} characters`;
});

await check("Angular columnar server render (shell only)", async () => {
  await importFrom("@angular/compiler", angularPackage);
  const { Component } = await importFrom("@angular/core", angularPackage);
  const { bootstrapApplication } = await importFrom("@angular/platform-browser", angularPackage);
  const { provideServerRendering, renderApplication } = await importFrom("@angular/platform-server", angularPackage);
  const angularArtifact = path.join(REPOSITORY_ROOT, "packages/angular/dist/angular/fesm2022/gp-grid-angular.mjs");
  const { GpGridComponent } = await import(pathToFileURL(angularArtifact).href);
  class SsrColumnarComponent {}
  Component({
    selector: "app-root",
    standalone: true,
    imports: [GpGridComponent],
    template: '<gp-grid [columns]="columns" [dataSource]="columnarSource" [rowHeight]="32" />',
  })(SsrColumnarComponent);
  SsrColumnarComponent.prototype.columns = columns;
  SsrColumnarComponent.prototype.columnarSource = columnarSource;
  const html = await renderApplication(
    (context) => bootstrapApplication(SsrColumnarComponent, { providers: [provideServerRendering()] }, context),
    { document: "<!doctype html><html><body><app-root></app-root></body></html>" },
  );
  if (html.includes("gp-grid-container") === false) throw new Error("Angular columnar grid shell was not rendered.");
  return `${html.length} characters (shell; async rows are not assumed)`;
});

const report = {
  timestamp: new Date().toISOString(),
  commit: provenance.commit,
  dirty: provenance.dirty,
  browserGlobalsPresent: typeof window !== "undefined" || typeof document !== "undefined",
  columnar: {
    serverRendersShellOnly: true,
    browserGlobalsRequired: false,
    note: "The columnar query is asynchronous; the server renders the shell and does not await rows.",
  },
  results,
};
const output = path.join(REPOSITORY_ROOT, "benchmarks/results/ssr-report.json");
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (results.some((result) => result.status === "failed")) process.exitCode = 1;
