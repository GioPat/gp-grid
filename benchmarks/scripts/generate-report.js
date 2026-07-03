#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, "../results");
const RUNS_DIR = path.join(RESULTS_DIR, "runs");
const ACTIVE_RUN_FILE = path.join(RESULTS_DIR, "current-run.json");

const categoryPrefixes = {
  scrollPerformance: "scroll-",
  initialRender: "render-",
  sortFilter: "sort-",
  memoryUsage: "memory-",
};

const loadActiveManifest = () => {
  if (fs.existsSync(ACTIVE_RUN_FILE)) {
    return JSON.parse(fs.readFileSync(ACTIVE_RUN_FILE, "utf-8"));
  }

  throw new Error("No active benchmark run found. Run `pnpm bench:start` first.");
};

const loadResults = (runDir, prefix) => {
  return fs
    .readdirSync(runDir)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(runDir, file), "utf-8")))
    .sort((a, b) => a.rowCount - b.rowCount || a.grid.localeCompare(b.grid));
};

const loadRun = () => {
  const manifest = loadActiveManifest();
  const runDir = path.join(RUNS_DIR, manifest.runId);

  const results = {
    scrollPerformance: loadResults(runDir, categoryPrefixes.scrollPerformance),
    initialRender: loadResults(runDir, categoryPrefixes.initialRender),
    sortFilter: loadResults(runDir, categoryPrefixes.sortFilter),
    memoryUsage: loadResults(runDir, categoryPrefixes.memoryUsage),
  };

  return {
    ...manifest,
    results,
    runDir,
  };
};

const formatRowCount = (count) => {
  if (count >= 1_000_000) return `${count / 1_000_000}M`;
  if (count >= 1_000) return `${count / 1_000}K`;
  return count.toString();
};

const gridCell = (result) => {
  return `[${result.displayName ?? result.grid}](${result.websiteUrl})`;
};

const addNotes = (lines, results) => {
  const notes = new Map();

  for (const result of results) {
    if (result.comment) {
      notes.set(result.displayName ?? result.grid, result.comment);
    }
  }

  if (notes.size === 0) {
    return;
  }

  lines.push("");
  lines.push("Notes:");
  for (const [name, comment] of notes) {
    lines.push(`- **${name}:** ${comment}`);
  }
};

const addTable = (lines, title, headers, results, rowBuilder) => {
  if (results.length === 0) {
    return;
  }

  lines.push(`## ${title}`);
  lines.push("");
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

  for (const result of results) {
    lines.push(`| ${rowBuilder(result).join(" | ")} |`);
  }

  addNotes(lines, results);
  lines.push("");
};

const addVersionsTable = (lines, libraryVersions) => {
  if (!libraryVersions) {
    return;
  }

  lines.push("## Library Versions");
  lines.push("");
  lines.push("| Grid | Package | Version |");
  lines.push("| --- | --- | --- |");

  for (const [grid, entry] of Object.entries(libraryVersions)) {
    for (const [pkg, version] of Object.entries(entry.packages)) {
      const label = entry.gitCommit ? `${version} (${entry.gitCommit})` : version;
      lines.push(`| ${grid} | \`${pkg}\` | ${label} |`);
    }
  }

  lines.push("");
};

const generateMarkdownSummary = (run) => {
  const lines = [];
  const environment = run.environment;
  const config = run.config;

  lines.push("# gp-grid Benchmark Results");
  lines.push("");
  lines.push(`**Run:** ${run.runId}`);
  lines.push(`**Date:** ${run.timestamp}`);
  lines.push(`**Machine:** ${environment.cpuModel}`);
  lines.push(
    `**Environment:** ${environment.os}, ${environment.logicalCpuCount} logical CPUs, ${environment.totalMemoryMB} MB RAM`,
  );
  lines.push(
    `**Runtime:** Node ${environment.nodeVersion}, Chrome ${environment.chromeVersion}`,
  );
  lines.push(
    `**Config:** ${config.iterations} iterations, ${config.playwrightWorkers} Playwright worker, retries ${config.retries}, overscan ${config.overscanRows ?? "n/a"} rows, ${config.viewport.width}x${config.viewport.height}, headless ${config.headless}`,
  );
  lines.push("");

  addVersionsTable(lines, run.libraryVersions);

  addTable(
    lines,
    "Scroll Performance",
    [
      "Grid",
      "Mode",
      "Rows",
      "Avg FPS",
      "P05 FPS",
      "P95 Frame Time",
      "Frame Drops",
      "Scroll Delta",
      "Scroll px/s",
    ],
    run.results.scrollPerformance,
    (result) => [
      gridCell(result),
      result.implementationMode,
      formatRowCount(result.rowCount),
      result.metrics.avgFPS,
      result.metrics.p05FPS,
      `${result.metrics.p95FrameTimeMs}ms`,
      result.metrics.frameDropCount,
      `${result.metrics.actualScrollDeltaPx}px`,
      `${result.metrics.scrollPxPerSecond ?? "n/a"}`,
    ],
  );

  addTable(
    lines,
    "Initial Render",
    ["Grid", "Mode", "Rows", "FCP", "Full Render", "LCP", "TBT"],
    run.results.initialRender,
    (result) => [
      gridCell(result),
      result.implementationMode,
      formatRowCount(result.rowCount),
      `${result.metrics.timeToFirstPaint}ms`,
      `${result.metrics.timeToFullRender}ms`,
      `${result.metrics.largestContentfulPaint}ms`,
      `${result.metrics.totalBlockingTime}ms`,
    ],
  );

  addTable(
    lines,
    "Sort/Filter Performance",
    [
      "Grid",
      "Mode",
      "Rows",
      "Sort Asc",
      "Sort Desc",
      "Multi Sort",
      "Text Filter",
      "Number Filter",
    ],
    run.results.sortFilter,
    (result) => [
      gridCell(result),
      result.implementationMode,
      formatRowCount(result.rowCount),
      `${result.metrics.sortAscTime}ms`,
      `${result.metrics.sortDescTime}ms`,
      `${result.metrics.multiColumnSortTime}ms`,
      `${result.metrics.textFilterTime}ms`,
      `${result.metrics.numberFilterTime}ms`,
    ],
  );

  addTable(
    lines,
    "Memory Usage",
    [
      "Grid",
      "Mode",
      "Rows",
      "After Load",
      "Peak",
      "After Scroll",
      "Growth / 1K",
      "Retained",
    ],
    run.results.memoryUsage,
    (result) => [
      gridCell(result),
      result.implementationMode,
      formatRowCount(result.rowCount),
      `${result.metrics.afterDataLoadHeapSizeMB}MB`,
      `${result.metrics.peakHeapSizeMB}MB`,
      `${result.metrics.afterScrollHeapSizeMB}MB`,
      `${result.metrics.heapGrowthRateMBPer1KRows}MB`,
      `${result.metrics.retainedAfterClearMB}MB`,
    ],
  );

  return lines.join("\n");
};

// Emit a flat, docs-consumable JSON. The gp-grid-docs benchmarks page renders
// this directly (one 1M-row table per category, plus the run header, library
// versions and fairness notes), so every value is pre-shaped here rather than
// re-derived in the docs: FPS as numbers, timings/heap as unit-suffixed strings,
// grid identified by its display name (the docs highlight key is "gp-grid").
const ms = (value) => `${value}ms`;
const mb = (value) => `${value}MB`;

const firstRowCount = (run) => {
  for (const category of Object.values(run.results)) {
    if (category.length > 0) {
      return category[0].rowCount;
    }
  }
  return null;
};

const collectDocsNotes = (run) => {
  const notes = new Map();
  for (const category of Object.values(run.results)) {
    for (const result of category) {
      if (result.comment) {
        notes.set(result.displayName ?? result.grid, result.comment);
      }
    }
  }
  return Array.from(notes, ([grid, comment]) => ({ grid, comment }));
};

const collectDocsVersions = (libraryVersions) => {
  if (!libraryVersions) {
    return [];
  }
  const rows = [];
  for (const [grid, entry] of Object.entries(libraryVersions)) {
    for (const [pkg, version] of Object.entries(entry.packages)) {
      rows.push({ grid, package: pkg, version, gitCommit: entry.gitCommit ?? null });
    }
  }
  return rows;
};

const docsScrollRow = (result) => ({
  grid: result.displayName ?? result.grid,
  mode: result.implementationMode,
  avgFps: result.metrics.avgFPS,
  p05Fps: result.metrics.p05FPS,
  p95FrameTimeMs: result.metrics.p95FrameTimeMs,
  frameDrops: result.metrics.frameDropCount,
  scrollDeltaPx: result.metrics.actualScrollDeltaPx,
});

const docsRenderRow = (result) => ({
  grid: result.displayName ?? result.grid,
  mode: result.implementationMode,
  firstPaint: ms(result.metrics.timeToFirstPaint),
  fullRender: ms(result.metrics.timeToFullRender),
  lcp: ms(result.metrics.largestContentfulPaint),
  tbt: ms(result.metrics.totalBlockingTime),
});

const docsSortFilterRow = (result) => ({
  grid: result.displayName ?? result.grid,
  mode: result.implementationMode,
  sortAsc: ms(result.metrics.sortAscTime),
  sortDesc: ms(result.metrics.sortDescTime),
  multiSort: ms(result.metrics.multiColumnSortTime),
  textFilter: ms(result.metrics.textFilterTime),
  numberFilter: ms(result.metrics.numberFilterTime),
});

const docsMemoryRow = (result) => ({
  grid: result.displayName ?? result.grid,
  mode: result.implementationMode,
  afterLoad: mb(result.metrics.afterDataLoadHeapSizeMB),
  peak: mb(result.metrics.peakHeapSizeMB),
  growth: result.metrics.heapGrowthRateMBPer1KRows,
  retained: mb(result.metrics.retainedAfterClearMB),
});

const buildDocsData = (run) => {
  const environment = run.environment;
  const config = run.config;

  return {
    meta: {
      runId: run.runId,
      timestamp: run.timestamp,
      machine: environment.cpuModel,
      os: environment.os,
      logicalCpuCount: environment.logicalCpuCount,
      totalMemoryMB: environment.totalMemoryMB,
      nodeVersion: environment.nodeVersion,
      chromeVersion: environment.chromeVersion,
      iterations: config.iterations,
      overscanRows: config.overscanRows ?? null,
      viewport: config.viewport,
      rowCount: firstRowCount(run),
    },
    versions: collectDocsVersions(run.libraryVersions),
    notes: collectDocsNotes(run),
    scroll: run.results.scrollPerformance.map(docsScrollRow),
    render: run.results.initialRender.map(docsRenderRow),
    sortFilter: run.results.sortFilter.map(docsSortFilterRow),
    memory: run.results.memoryUsage.map(docsMemoryRow),
  };
};

console.log("Generating benchmark report...");

const run = loadRun();
const jsonReport = {
  runId: run.runId,
  timestamp: run.timestamp,
  environment: run.environment,
  config: run.config,
  libraryVersions: run.libraryVersions,
  results: run.results,
};
const markdown = generateMarkdownSummary(run);

const jsonPath = path.join(run.runDir, "benchmark-report.json");
const mdPath = path.join(run.runDir, "BENCHMARK-RESULTS.mdx");
fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
fs.writeFileSync(mdPath, markdown);
fs.writeFileSync(path.join(RESULTS_DIR, "benchmark-report.json"), JSON.stringify(jsonReport, null, 2));
fs.writeFileSync(path.join(RESULTS_DIR, "BENCHMARK-RESULTS.mdx"), markdown);

const docsData = buildDocsData(run);
const docsDataString = JSON.stringify(docsData, null, 2);
const docsDataPath = path.join(run.runDir, "benchmark-data.json");
fs.writeFileSync(docsDataPath, docsDataString);
fs.writeFileSync(path.join(RESULTS_DIR, "benchmark-data.json"), docsDataString);

console.log(`JSON report saved to: ${jsonPath}`);
console.log(`MDX report saved to: ${mdPath}`);
console.log(`Docs data saved to: ${docsDataPath}`);
console.log("");
console.log(markdown);
