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
/** Six object rows: a positive frozen count with a suffix, so `minSuffixHeight` 64 participates. */
const frozenRows = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `Frozen row ${index}` }));
const freezeRows = { count: 3 };
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

const expectFields = (actual, expected, label) => {
  for (const [key, value] of Object.entries(expected)) {
    if (actual?.[key] !== value) {
      throw new Error(`${label}.${key}: expected ${String(value)}, got ${String(actual?.[key])}`);
    }
  }
};

/** React and Vue create their core after mount, so the shell carries no band. */
const expectShellWithoutBand = (html, label) => {
  if (html.includes("gp-grid-container") === false) {
    throw new Error(`${label} grid shell was not rendered.`);
  }
  for (const marker of ["gp-grid-frozen-rows", "gp-grid-frozen-pins"]) {
    if (html.includes(marker)) {
      throw new Error(`${label} serialized ${marker}; its core is created after mount.`);
    }
  }
  return `${label}: shell with freezeRows, no frozen markup`;
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

await check("core frozen rows resolve zero on the server", async () => {
  if (typeof window !== "undefined" || typeof document !== "undefined") {
    throw new Error("The core check must run without browser globals.");
  }
  const core = new coreArtifact.GridCore({
    columns,
    dataSource: columnarSource,
    rowHeight: 32,
    freezeRows,
  });
  const zero = { requestedCount: freezeRows.count, effectiveCount: 0, limit: null };
  // C9's baseline is the empty-axis resolution, so nothing freezes pre-data.
  expectFields(core.frozenRows.get(), zero, "getFrozenRows()");
  const regions = core.geometry.getRowRegions();
  expectFields(regions.frozen, zero, "getRowRegions().frozen");
  if (regions.frozenCount !== 0 || regions.frozenExtent !== 0) {
    throw new Error(`Region layout is not zero: count ${regions.frozenCount}, extent ${regions.frozenExtent}`);
  }
  // 600 px is the core's unmeasured-viewport estimate; the suffix keeps it whole.
  if (regions.suffixViewportHeight !== 600) {
    throw new Error(`Unmeasured suffix height: ${regions.suffixViewportHeight}`);
  }
  const size = core.geometry.getContentSize();
  if (Number.isFinite(size.width) === false || Number.isFinite(size.height) === false) {
    throw new Error(`Non-finite content size: ${JSON.stringify(size)}`);
  }
  core.destroy();
  return `effective 0, suffix ${regions.suffixViewportHeight}px, content ${size.width}x${size.height}`;
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

await check("React frozen rows server render", async () => {
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { Grid } = await import(pathToFileURL(artifact("@gp-grid/react")).href);
  const html = renderToString(React.createElement(Grid, {
    columns,
    rowData: frozenRows,
    rowHeight: 32,
    freezeRows,
    initialWidth: 500,
    initialHeight: 300,
    getRowId: (row) => row.id,
  }));
  return expectShellWithoutBand(html, "React");
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

const pinnedColumns = [
  { colId: "pin-start", field: "id", headerName: "ID", width: 120, cellDataType: "number", pinned: "start" },
  { colId: "name", field: "name", headerName: "Name", width: 160, cellDataType: "text" },
  { colId: "pin-end", field: "label", headerName: "Label", width: 90, cellDataType: "text", pinned: "end" },
];

/** Markup of one pin region's header container. */
const pinSegment = (html, region) => {
  const marker = `data-pin-region="${region}"`;
  const at = html.indexOf(marker);
  if (at === -1) throw new Error(`No ${region} pin container in the SSR markup.`);
  const next = html.indexOf('data-pin-region="', at + marker.length);
  return html.slice(at, next === -1 ? undefined : next);
};

/** Assert the server markup carries both pin containers and their cells. */
const expectPinnedShell = (html, label) => {
  if (html.includes('role="grid"') === false || html.includes('aria-colcount="3"') === false) {
    throw new Error("The grid shell is missing its grid role or column count.");
  }
  const pinContainers = html.match(/gp-grid-pin-header/g) ?? [];
  if (pinContainers.length !== 2) {
    throw new Error(`Expected a start and an end pin container, found ${pinContainers.length}.`);
  }
  if (pinSegment(html, "start").includes('aria-colindex="1"') === false) {
    throw new Error("The start pin container does not hold displayed column 1.");
  }
  if (pinSegment(html, "end").includes('aria-colindex="3"') === false) {
    throw new Error("The end pin container does not hold displayed column 3.");
  }
  return `${label}: ${pinContainers.length} pin containers with their header cells`;
};

/**
 * The deterministic first render seeds regions from the declared pins, so a
 * pin header cell is server-rendered with and without a measured width: an
 * unmeasured viewport admits every pin.
 */
const checkPinnedHeader = async (label, initialWidth) => {
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { Grid } = await import(pathToFileURL(artifact("@gp-grid/react")).href);
  const props = {
    columns: pinnedColumns,
    rowData: rows,
    rowHeight: 32,
    getRowId: (row) => row.id,
  };
  if (initialWidth !== undefined) props.initialWidth = initialWidth;
  return expectPinnedShell(renderToString(React.createElement(Grid, props)), label);
};

await check("React pinned header cells with initialWidth", () =>
  checkPinnedHeader("initialWidth=500", 500));

await check("React pinned header cells without initialWidth", () =>
  checkPinnedHeader("unmeasured", undefined));

const vuePackage = path.join(REPOSITORY_ROOT, "playgrounds/vite-vue/package.json");

/** Vue pins are declared on the columns, so the same shell rules apply. */
const checkVuePinnedHeader = async (label, initialWidth) => {
  const { createSSRApp, h } = await importFrom("vue", vuePackage);
  const { renderToString } = await importFrom("vue/server-renderer", vuePackage);
  const vueArtifact = path.join(REPOSITORY_ROOT, "packages/vue/dist/index.js");
  const { GpGrid } = await import(pathToFileURL(vueArtifact).href);
  const props = { columns: pinnedColumns, rowData: rows, rowHeight: 32 };
  if (initialWidth !== undefined) props.initialWidth = initialWidth;
  const app = createSSRApp({ render: () => h(GpGrid, props) });
  return expectPinnedShell(await renderToString(app), label);
};

await check("Vue pinned header cells with initialWidth", () =>
  checkVuePinnedHeader("initialWidth=500", 500));

await check("Vue pinned header cells without initialWidth", () =>
  checkVuePinnedHeader("unmeasured", undefined));
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

await check("Vue frozen rows server render", async () => {
  const { createSSRApp, h } = await importFrom("vue", vuePackage);
  const { renderToString } = await importFrom("vue/server-renderer", vuePackage);
  const vueArtifact = path.join(REPOSITORY_ROOT, "packages/vue/dist/index.js");
  const { GpGrid } = await import(pathToFileURL(vueArtifact).href);
  const app = createSSRApp({
    render: () => h(GpGrid, {
      columns,
      rowData: frozenRows,
      rowHeight: 32,
      freezeRows,
      initialWidth: 500,
      initialHeight: 300,
    }),
  });
  return expectShellWithoutBand(await renderToString(app), "Vue");
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

/**
 * Angular creates its core in `ngOnInit`, so its first page can arrive before
 * serialization: the band is optional, but serialized suffix rows without it
 * would be wrong, and the band's rows keep their logical 1-based indices.
 */
const expectAngularFrozenBand = (html) => {
  if (html.includes("gp-grid-container") === false) throw new Error("Angular grid shell was not rendered.");
  const blockAt = html.indexOf("gp-grid-frozen-rows");
  if (blockAt === -1) {
    if (html.includes("gp-grid-rows-wrapper")) {
      throw new Error("Angular serialized the suffix rows without the frozen band.");
    }
    return "shell only; the first page had not arrived at serialization";
  }
  // The band carries its own `.gp-grid-rows-wrapper`; the pin layer ends it and
  // the suffix rows wrapper follows.
  const pinsAt = html.indexOf("gp-grid-frozen-pins", blockAt);
  const band = html.slice(blockAt, pinsAt === -1 ? html.length : pinsAt);
  const indices = [...band.matchAll(/aria-rowindex="(\d+)"/g)].map((match) => Number(match[1]));
  const expected = Array.from({ length: freezeRows.count }, (_value, index) => index + 1);
  if (indices.join(",") !== expected.join(",")) {
    throw new Error(`Angular frozen band rows: expected ${expected.join(",")}, got ${indices.join(",")}`);
  }
  return `frozen band rows ${indices.join(",")} before the suffix wrapper`;
};

await check("Angular frozen rows server render", async () => {
  await importFrom("@angular/compiler", angularPackage);
  const { Component } = await importFrom("@angular/core", angularPackage);
  const { bootstrapApplication } = await importFrom("@angular/platform-browser", angularPackage);
  const { provideServerRendering, renderApplication } = await importFrom("@angular/platform-server", angularPackage);
  const angularArtifact = path.join(REPOSITORY_ROOT, "packages/angular/dist/angular/fesm2022/gp-grid-angular.mjs");
  const { GpGridComponent } = await import(pathToFileURL(angularArtifact).href);
  class SsrFrozenComponent {}
  Component({
    selector: "app-root",
    standalone: true,
    imports: [GpGridComponent],
    template: '<gp-grid [columns]="columns" [rows]="rows" [rowHeight]="32" [freezeRows]="freezeRows" />',
  })(SsrFrozenComponent);
  SsrFrozenComponent.prototype.columns = columns;
  SsrFrozenComponent.prototype.rows = frozenRows;
  SsrFrozenComponent.prototype.freezeRows = freezeRows;
  const html = await renderApplication(
    (context) => bootstrapApplication(SsrFrozenComponent, { providers: [provideServerRendering()] }, context),
    { document: "<!doctype html><html><body><app-root></app-root></body></html>" },
  );
  return expectAngularFrozenBand(html);
});

await check("Angular pinned header cells", async () => {
  await importFrom("@angular/compiler", angularPackage);
  const { Component } = await importFrom("@angular/core", angularPackage);
  const { bootstrapApplication } = await importFrom("@angular/platform-browser", angularPackage);
  const { provideServerRendering, renderApplication } = await importFrom("@angular/platform-server", angularPackage);
  const angularArtifact = path.join(REPOSITORY_ROOT, "packages/angular/dist/angular/fesm2022/gp-grid-angular.mjs");
  const { GpGridComponent } = await import(pathToFileURL(angularArtifact).href);
  class SsrPinnedComponent {}
  Component({
    selector: "app-root",
    standalone: true,
    imports: [GpGridComponent],
    template: '<gp-grid [columns]="columns" [rows]="rows" [rowHeight]="32" />',
  })(SsrPinnedComponent);
  SsrPinnedComponent.prototype.columns = pinnedColumns;
  SsrPinnedComponent.prototype.rows = rows;
  const html = await renderApplication(
    (context) => bootstrapApplication(SsrPinnedComponent, { providers: [provideServerRendering()] }, context),
    { document: "<!doctype html><html><body><app-root></app-root></body></html>" },
  );
  // No initialWidth input: the first render is unmeasured, so every pin is admitted.
  return expectPinnedShell(html, "unmeasured");
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
