import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { collectArtifactProvenance, REPOSITORY_ROOT } from "./artifact-resolution.js";
import {
  BAND_HEIGHTS,
  DISPLAY_ORDER,
  GROUP_RENDERER_CLASS,
  HEADER_HEIGHT,
  columnGroups,
  expectCoreBands,
  expectCoreFragments,
  expectGroupedHeader,
  expectHeaderClipRules,
  expectList,
  groupColumns,
  groupRendererText,
  groupRows,
} from "./ssr-column-groups.mjs";

import {
  checkEngineGrouping,
  checkExternalHierarchy,
  createColumnarSource,
  createExternalSource,
  createGrouping,
  createObjectSource,
  expectAngularRowGroupShell,
  expectFlatShell,
  renderWithoutErrors,
  rowGroupColumns,
  rowGroupRows,
} from "./ssr-row-groups.mjs";

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

await check("core row heights resolve after the first load", async () => {
  if (typeof window !== "undefined" || typeof document !== "undefined") {
    throw new Error("The core check must run without browser globals.");
  }
  const core = new coreArtifact.GridCore({
    columns,
    dataSource: coreArtifact.createClientDataSource(rows),
    rowHeight: 32,
    getRowId: (row) => row.id,
  });
  // A height set before the first load lists, and its row is not placed yet.
  core.rowHeights.set([{ rowId: 1, height: 64 }]);
  const listed = core.rowHeights.getOverrides();
  if (listed.length !== 1 || listed[0].height !== 64) {
    throw new Error(`Unlisted override: ${JSON.stringify(listed)}`);
  }
  if (core.geometry.getRowBounds(0, "content") !== undefined) {
    throw new Error("A row resolved before its data arrived.");
  }
  const before = core.geometry.getContentSize();
  if (Number.isFinite(before.width) === false || Number.isFinite(before.height) === false) {
    throw new Error(`Non-finite content size: ${JSON.stringify(before)}`);
  }

  await core.initialize();

  const bounds = core.geometry.getRowBounds(0, "content");
  if (bounds === undefined) throw new Error("The loaded row has no content bounds.");
  if (bounds.end - bounds.start !== 64) {
    throw new Error(`Row 1 is ${bounds.end - bounds.start}px, expected 64px`);
  }
  const after = core.geometry.getContentSize().height;
  core.destroy();
  return `rowId 1 is 64px, extent ${before.height} -> ${after}`;
});

const expectNoBrowserGlobals = () => {
  if (typeof window !== "undefined" || typeof document !== "undefined") {
    throw new Error("The core check must run without browser globals.");
  }
};

/** The PRD 007 fixture on a server core: no measurement host, as every wrapper builds on the server. */
const createGroupCore = (overrides = {}) =>
  new coreArtifact.GridCore({
    columns: groupColumns,
    dataSource: coreArtifact.createClientDataSource(groupRows),
    rowHeight: 32,
    getRowId: (row) => row.id,
    columnLayout: "fixed",
    headerHeight: HEADER_HEIGHT,
    headerBandHeights: BAND_HEIGHTS,
    columnGroups,
    ...overrides,
  });

const lastHeaderBands = (batches) =>
  batches.flat().filter((instruction) => instruction.type === "SET_HEADER_BANDS").at(-1)?.bands;

await check("core fit commands are unsupported without a host", async () => {
  expectNoBrowserGlobals();
  const core = createGroupCore();
  const statuses = () => [
    core.rowHeights.fit().status,
    core.rowHeights.fit([1]).status,
    core.columns.fit().status,
    core.columns.fit(["a"]).status,
  ];
  const phases = [["before load", statuses()]];
  await core.initialize();
  phases.push(["after load", statuses()]);
  core.destroy();
  phases.push(["after destroy", statuses()]);
  for (const [phase, list] of phases) {
    expectList(list, ["unsupported", "unsupported", "unsupported", "unsupported"], `fit ${phase}`);
  }
  return "rowHeights.fit and columns.fit, with and without ids: unsupported before load, after load and after destroy";
});

await check("core grouped header publishes its configured bands", async () => {
  expectNoBrowserGlobals();
  const core = createGroupCore();
  const batches = [];
  core.onBatchInstruction((batch) => batches.push(batch));
  await core.initialize();
  const published = lastHeaderBands(batches);
  if (published === undefined) throw new Error("The first load published no SET_HEADER_BANDS.");
  expectCoreBands(published, "SET_HEADER_BANDS");
  expectCoreBands(core.header.getBands(), "header.getBands()");
  const columnWindow = core.geometry.getColumnWindow();
  expectList(columnWindow.layout.columns.map((column) => column.columnId), DISPLAY_ORDER, "display order");
  const fragments = expectCoreFragments(columnWindow.groups, "getColumnWindow().groups");

  // A band past the configured list takes headerHeight.
  batches.length = 0;
  core.header.setBandHeights(BAND_HEIGHTS.slice(0, 2));
  const fallback = [...BAND_HEIGHTS.slice(0, 2), HEADER_HEIGHT, HEADER_HEIGHT];
  expectList(lastHeaderBands(batches)?.heights ?? [], fallback, "setBandHeights batch");
  expectList([batches.length], [1], "setBandHeights batch count");

  core.destroy();
  core.header.setBandHeights(BAND_HEIGHTS);
  expectList(core.header.getBands().heights, fallback, "setBandHeights after destroy");
  return `bands ${BAND_HEIGHTS.join("/")}px, fragments ${fragments}; [40, 28] -> ${fallback.join("/")}px in one batch; no-op after destroy`;
});

await check("core rejected column groups stay flat", async () => {
  expectNoBrowserGlobals();
  // `x` is never referenced: missingLeaf.
  const rejected = columnGroups.filter((child) => child !== "x");
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  let core;
  try {
    core = createGroupCore({ columnGroups: rejected });
  } finally {
    console.warn = warn;
  }
  expectList([warnings.length], [1], "construction warnings");
  if (core.columns.getGroups() !== null) throw new Error("The rejected hierarchy was adopted.");
  const definitionOrder = groupColumns.map((column) => column.colId);
  // A flat grid has one band; the configured entries past it are ignored.
  const flatBands = { count: 1, heights: [BAND_HEIGHTS[0]], totalHeight: BAND_HEIGHTS[0] };
  const columnWindow = core.geometry.getColumnWindow();
  const seed = coreArtifact.createInitialState({
    initialColumns: groupColumns,
    initialColumnLayout: "fixed",
    initialHeaderHeight: HEADER_HEIGHT,
    initialHeaderBandHeights: BAND_HEIGHTS,
    initialColumnGroups: rejected,
  });
  const views = [
    ["core", core.header.getBands(), columnWindow],
    ["seed", seed.headerBands, seed.columnWindow],
  ];
  for (const [label, bands, flatWindow] of views) {
    expectFields(bands, { count: flatBands.count, totalHeight: flatBands.totalHeight }, `${label} bands`);
    expectList(bands.heights, flatBands.heights, `${label} band heights`);
    expectList(flatWindow.layout.columns.map((column) => column.columnId), definitionOrder, `${label} order`);
    const { start, center, end } = flatWindow.groups;
    expectList([...start, ...center, ...end], [], `${label} fragments`);
  }
  core.destroy();
  return `warned once (${warnings[0]}); core and seed flat in definition order, one ${BAND_HEIGHTS[0]}px band`;
});

await check("core row grouping over object rows", () =>
  checkEngineGrouping(coreArtifact, createObjectSource(coreArtifact), "object rows"));

await check("core row grouping over columnar rows", () =>
  checkEngineGrouping(coreArtifact, createColumnarSource(coreArtifact), "columnar rows"));

await check("core binds a source-supplied hierarchy", () => checkExternalHierarchy(coreArtifact));

/** The two PRD 008 server renders of one wrapper: the local engine, then a hierarchy from the source. */
const rowGroupArms = () => [
  ["rowGrouping", { rowData: rowGroupRows, rowGrouping: createGrouping(coreArtifact) }],
  ["external hierarchy", { dataSource: createExternalSource() }],
];
const rowGroupShellProps = { columns: rowGroupColumns, rowHeight: 32, columnLayout: "fixed" };

const checkRowGroupShells = async (label, render, expectShell = expectFlatShell) => {
  const details = [];
  for (const [arm, props] of rowGroupArms()) {
    const html = await renderWithoutErrors(() => render(props));
    details.push(expectShell(html, `${label} ${arm}`));
  }
  return details.join("; ");
};

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

const groupProps = {
  columns: groupColumns,
  rowHeight: 32,
  columnLayout: "fixed",
  headerHeight: HEADER_HEIGHT,
  headerBandHeights: BAND_HEIGHTS,
  columnGroups,
};

const readStylesheet = (relativePath) => fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");

/**
 * Leaves of the window React and Vue seed before their core exists. The width
 * leaves the `totals` leaves outside it, so the render must follow the seed
 * rather than list every run.
 */
const SEEDED_WINDOW_WIDTH = 240;
const seededWindowLeaves = () => {
  const { columnWindow } = coreArtifact.createInitialState({
    initialColumns: groupColumns,
    initialWidth: SEEDED_WINDOW_WIDTH,
    initialColumnLayout: "fixed",
    initialHeaderHeight: HEADER_HEIGHT,
    initialHeaderBandHeights: BAND_HEIGHTS,
    initialColumnGroups: columnGroups,
  });
  const { start, center, end } = columnWindow;
  const mounted = [...start, ...center, ...end].map((column) => column.columnId);
  if (mounted.length >= DISPLAY_ORDER.length) {
    throw new Error(`The ${SEEDED_WINDOW_WIDTH}px seed mounts every leaf; the check would prove nothing.`);
  }
  return mounted;
};

const renderReactGroups = async (extraProps) => {
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { Grid } = await import(pathToFileURL(artifact("@gp-grid/react")).href);
  const totals = (params) => React.createElement("span", { className: GROUP_RENDERER_CLASS }, groupRendererText(params));
  return renderToString(React.createElement(Grid, {
    ...groupProps,
    rowData: groupRows,
    getRowId: (row) => row.id,
    headerRenderers: { totals },
    ...extraProps,
  }));
};

// React and Vue render before their core exists: a fragment resolves its group from the columnGroups prop.
await check("React grouped header server render", async () => {
  const html = await renderReactGroups({});
  const detail = expectGroupedHeader(html, { label: "React" });
  return `${detail}; ${expectHeaderClipRules(readStylesheet("packages/react/dist/styles.css"), "React")}`;
});

await check("React grouped header follows the seeded window", async () => {
  const html = await renderReactGroups({ initialWidth: SEEDED_WINDOW_WIDTH });
  return expectGroupedHeader(html, { label: "React", mounted: seededWindowLeaves() });
});

await check("React row groups server render", async () => {
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { Grid } = await import(pathToFileURL(artifact("@gp-grid/react")).href);
  return checkRowGroupShells("React", (props) =>
    renderToString(React.createElement(Grid, {
      ...rowGroupShellProps,
      initialWidth: 500,
      initialHeight: 300,
      getRowId: (row) => row.id,
      ...props,
    })));
});

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

const renderVueGroups = async (extraProps) => {
  const { createSSRApp, h } = await importFrom("vue", vuePackage);
  const { renderToString } = await importFrom("vue/server-renderer", vuePackage);
  const vueArtifact = path.join(REPOSITORY_ROOT, "packages/vue/dist/index.js");
  const { GpGrid } = await import(pathToFileURL(vueArtifact).href);
  const totals = (params) => h("span", { class: GROUP_RENDERER_CLASS }, groupRendererText(params));
  const app = createSSRApp({
    render: () => h(GpGrid, { ...groupProps, rowData: groupRows, headerRenderers: { totals }, ...extraProps }),
  });
  return renderToString(app);
};

await check("Vue grouped header server render", async () => {
  const html = await renderVueGroups({});
  const detail = expectGroupedHeader(html, { label: "Vue" });
  return `${detail}; ${expectHeaderClipRules(readStylesheet("packages/vue/dist/styles.css"), "Vue")}`;
});

await check("Vue grouped header follows the seeded window", async () => {
  const html = await renderVueGroups({ initialWidth: SEEDED_WINDOW_WIDTH });
  return expectGroupedHeader(html, { label: "Vue", mounted: seededWindowLeaves() });
});

await check("Vue row groups server render", async () => {
  const { createSSRApp, h } = await importFrom("vue", vuePackage);
  const { renderToString } = await importFrom("vue/server-renderer", vuePackage);
  const vueArtifact = path.join(REPOSITORY_ROOT, "packages/vue/dist/index.js");
  const { GpGrid } = await import(pathToFileURL(vueArtifact).href);
  return checkRowGroupShells("Vue", (props) => {
    const app = createSSRApp({
      render: () => h(GpGrid, { ...rowGroupShellProps, initialWidth: 500, initialHeight: 300, ...props }),
    });
    return renderToString(app);
  });
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
 * ARIA rows the serialized header takes ahead of the body rows (PRD 007 D9):
 * the flat header row, or one row per band.
 */
const headerRowCount = (html) => {
  const headerAt = html.indexOf("gp-grid-header");
  const bodyAt = html.indexOf("gp-grid-body", headerAt);
  return [...html.slice(headerAt, bodyAt).matchAll(/role="row"/g)].length;
};

/**
 * Angular creates its core in `ngOnInit`, so its first page can arrive before
 * serialization: the band is optional, but serialized suffix rows without it
 * would be wrong, and the band's rows keep their logical indices after the
 * header's rows.
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
  const headerRows = headerRowCount(html);
  const expected = Array.from({ length: freezeRows.count }, (_value, index) => index + headerRows + 1);
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

await check("Angular grouped header server render", async () => {
  await importFrom("@angular/compiler", angularPackage);
  const { Component } = await importFrom("@angular/core", angularPackage);
  const { bootstrapApplication } = await importFrom("@angular/platform-browser", angularPackage);
  const { provideServerRendering, renderApplication } = await importFrom("@angular/platform-server", angularPackage);
  const angularArtifact = path.join(REPOSITORY_ROOT, "packages/angular/dist/angular/fesm2022/gp-grid-angular.mjs");
  const { GpGridComponent } = await import(pathToFileURL(angularArtifact).href);
  class SsrGroupsComponent {}
  Component({
    selector: "app-root",
    standalone: true,
    imports: [GpGridComponent],
    template: `<ng-template #totalsTpl let-params>
        <span class="${GROUP_RENDERER_CLASS}">{{ params.group.headerName }}: {{ params.columnIds.join("+") }}</span>
      </ng-template>
      <gp-grid [columns]="columns" [rows]="rows" [rowHeight]="32" columnLayout="fixed"
        [headerHeight]="headerHeight" [headerBandHeights]="bandHeights" [columnGroups]="groups"
        [headerRenderers]="{ totals: totalsTpl }" />`,
  })(SsrGroupsComponent);
  Object.assign(SsrGroupsComponent.prototype, {
    columns: groupColumns,
    rows: groupRows,
    headerHeight: HEADER_HEIGHT,
    bandHeights: BAND_HEIGHTS,
    groups: columnGroups,
  });
  const html = await renderApplication(
    (context) => bootstrapApplication(SsrGroupsComponent, { providers: [provideServerRendering()] }, context),
    { document: "<!doctype html><html><body><app-root></app-root></body></html>" },
  );
  const detail = expectGroupedHeader(html, { label: "Angular" });
  const css = readStylesheet("packages/angular/dist/angular/dist/styles.css");
  return `${detail}; ${expectHeaderClipRules(css, "Angular")}`;
});

await check("Angular row groups server render", async () => {
  await importFrom("@angular/compiler", angularPackage);
  const { Component } = await importFrom("@angular/core", angularPackage);
  const { bootstrapApplication } = await importFrom("@angular/platform-browser", angularPackage);
  const { provideServerRendering, renderApplication } = await importFrom("@angular/platform-server", angularPackage);
  const angularArtifact = path.join(REPOSITORY_ROOT, "packages/angular/dist/angular/fesm2022/gp-grid-angular.mjs");
  const { GpGridComponent } = await import(pathToFileURL(angularArtifact).href);
  // One template per arm: the `dataSource` input takes a source or `null`, never an unset property.
  const dataInputs = (props) =>
    props.dataSource === undefined ? '[rows]="rowData" [rowGrouping]="rowGrouping"' : '[dataSource]="dataSource"';
  return checkRowGroupShells("Angular", (props) => {
    class SsrRowGroupsComponent {}
    Component({
      selector: "app-root",
      standalone: true,
      imports: [GpGridComponent],
      template: `<gp-grid [columns]="columns" [rowHeight]="32" columnLayout="fixed" ${dataInputs(props)} />`,
    })(SsrRowGroupsComponent);
    Object.assign(SsrRowGroupsComponent.prototype, { columns: rowGroupColumns, ...props });
    return renderApplication(
      (context) => bootstrapApplication(SsrRowGroupsComponent, { providers: [provideServerRendering()] }, context),
      { document: "<!doctype html><html><body><app-root></app-root></body></html>" },
    );
  }, expectAngularRowGroupShell);
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
  rowGroups: {
    browserGlobalsRequired: false,
    note: "A grid is flat until its first load: React and Vue serialize role=\"grid\"; Angular serializes the collapsed hierarchy when its first load arrives before serialization.",
  },
  results,
};
const output = path.join(REPOSITORY_ROOT, "benchmarks/results/ssr-report.json");
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (results.some((result) => result.status === "failed")) process.exitCode = 1;
