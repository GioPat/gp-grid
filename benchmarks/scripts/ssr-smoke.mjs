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

const provenance = collectArtifactProvenance("candidate");
const artifact = (name) => {
  const found = provenance.packages.find((item) => item.name === name);
  if (found === undefined) throw new Error(`Missing ${name} candidate artifact.`);
  return found.entry;
};

await check("core import without browser globals", async () => {
  const core = await import(pathToFileURL(artifact("@gp-grid/core")).href);
  return `GridCore:${typeof core.GridCore}`;
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

const report = {
  timestamp: new Date().toISOString(),
  commit: provenance.commit,
  dirty: provenance.dirty,
  browserGlobalsPresent: typeof window !== "undefined" || typeof document !== "undefined",
  results,
};
const output = path.join(REPOSITORY_ROOT, "benchmarks/results/ssr-report.json");
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (results.some((result) => result.status === "failed")) process.exitCode = 1;
