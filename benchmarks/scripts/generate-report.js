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

// The comparison only covers grids that render rows to real DOM nodes;
// canvas-painting grids are excluded because their rendering model is not
// comparable row-for-row.
const SCOPE_NOTE =
  "DOM-rendering grids. Canvas-rendering grids are excluded: their painting model is not directly comparable.";

// Standing explanation for the scroll table: every grid receives the same
// wheel input, so differences in traversed distance are reported as data
// (Rows Traversed) rather than equalized by driving grid-specific scroll APIs.
const SCROLL_NOTE =
  "Every grid receives the identical mouse-wheel input. Each grid's scroll and virtualization model translates that input into a different distance (custom scrollbars and dampened virtual-scroll wheel handling rescale the deltas), so the Rows Traversed column shows how many rows each grid actually covered during the measured pass.";

const PACKAGE_SIZE_NOTE =
  "Production ESM JavaScript and CSS bundles of the exact grid-library imports used by each benchmark, minified by Vite and measured with gzip. React and React DOM peer dependencies are excluded; bundled transitive dependencies and imported CSS are included, while other emitted assets are excluded. Every package is sized at the published npm version shown in its Packages cell.";

const REPO_URL = "https://github.com/GioPat/gp-grid";

// Steps to reproduce a run, emitted at the bottom of the report so the numbers
// are self-documenting. The commands run from the repo's `benchmarks/`
// directory; the optional env vars mirror the ones start-run.js reads.
const buildReproduceLines = () => [
  "## Reproduce",
  "",
  `Clone [gp-grid](${REPO_URL}), then from the \`benchmarks/\` directory:`,
  "",
  "```bash",
  "pnpm install",
  "pnpm bench",
  "```",
  "",
  "Optionally override the defaults with environment variables before `pnpm bench`:",
  "",
  "- `BENCH_ROW_COUNTS` — comma-separated row counts (default `1000000`)",
  "- `BENCH_ITERATIONS` — iterations per grid (default `5`)",
  "- `BENCH_RUN_ID` — a label for the run's results directory",
  "",
];

const loadActiveManifest = () => {
  if (fs.existsSync(ACTIVE_RUN_FILE)) {
    return JSON.parse(fs.readFileSync(ACTIVE_RUN_FILE, "utf-8"));
  }

  throw new Error("No active benchmark run found. Run `pnpm bench:start` first.");
};

// gp-grid leads every table; the other grids follow alphabetically.
const gridOrderKey = (result) => (result.grid === "gp-grid" ? "" : result.grid);

const loadResults = (runDir, prefix) => {
  return fs
    .readdirSync(runDir)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(runDir, file), "utf-8")))
    .sort(
      (a, b) =>
        a.rowCount - b.rowCount ||
        gridOrderKey(a).localeCompare(gridOrderKey(b)),
    );
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

// Cells are plain strings, { label, url } links, or { code } package names;
// the markdown and HTML renderers format each shape for their target.
const gridLink = (result) => ({
  label: result.displayName ?? result.grid,
  url: result.websiteUrl,
});

const buildMetaEntries = (run) => {
  const environment = run.environment;
  const config = run.config;
  // Older runs predate the shared row-height config entry.
  const rowHeightLabel = config.rowHeightPx
    ? `${config.rowHeightPx}px row height`
    : "row height n/a";

  return [
    ["Run", run.runId],
    ["Date", run.timestamp],
    ["Machine", environment.cpuModel],
    [
      "Environment",
      `${environment.os}, ${environment.logicalCpuCount} logical CPUs, ${environment.totalMemoryMB} MB RAM`,
    ],
    ["Runtime", `Node ${environment.nodeVersion}, Chrome ${environment.chromeVersion}`],
    [
      "Config",
      `${config.iterations} iterations, ${config.playwrightWorkers} Playwright worker, retries ${config.retries}, overscan ${config.overscanRows ?? "n/a"} rows, ${rowHeightLabel}, ${config.viewport.width}x${config.viewport.height}, headless ${config.headless}`,
    ],
    ["Scope", SCOPE_NOTE],
  ];
};

const buildVersionRows = (libraryVersions) => {
  const rows = [];
  for (const [grid, entry] of Object.entries(libraryVersions ?? {})) {
    for (const [pkg, version] of Object.entries(entry.packages)) {
      rows.push([grid, { code: pkg }, version]);
    }
  }
  return rows;
};

const formatBytes = (bytes) => {
  if (bytes < 1_000) {
    return `${bytes} B`;
  }

  return `${(bytes / 1_000).toFixed(1)} kB`;
};

// Averaged heap samples carry float noise (e.g. 461.96500000000003).
const formatMB = (value) => `${Number(value).toFixed(2)}MB`;

// Older runs predate the recorded per-package measured versions.
const packageAtVersion = (size, pkg) => {
  const version = size.versions?.[pkg];
  return version ? `${pkg}@${version}` : pkg;
};

const buildPackageSizeRows = (packageSizes) => {
  return Object.entries(packageSizes ?? {}).map(([grid, size]) => [
    grid,
    { codes: size.packages.map((pkg) => packageAtVersion(size, pkg)) },
    formatBytes(size.minifiedBytes),
    formatBytes(size.gzipBytes),
  ]);
};

const buildSections = (run) => [
  {
    title: "Library Versions",
    headers: ["Grid", "Package", "Version"],
    rows: buildVersionRows(run.libraryVersions),
  },
  {
    title: "Package Bundle Sizes",
    note: PACKAGE_SIZE_NOTE,
    headers: ["Grid", "Packages", "Minified", "Gzip"],
    rows: buildPackageSizeRows(run.packageSizes),
  },
  {
    title: "Scroll Performance",
    note: SCROLL_NOTE,
    headers: [
      "Grid",
      "Mode",
      "Rows",
      "Avg FPS",
      "P05 FPS",
      "P95 Frame Time",
      "Frame Drops",
      "Rows Traversed",
      "Scroll Delta",
      "Scroll px/s",
    ],
    rows: run.results.scrollPerformance.map((result) => [
      gridLink(result),
      result.implementationMode,
      formatRowCount(result.rowCount),
      result.metrics.avgFPS,
      result.metrics.p05FPS,
      `${result.metrics.p95FrameTimeMs}ms`,
      result.metrics.frameDropCount,
      result.metrics.rowsTraversed ?? "n/a",
      `${result.metrics.actualScrollDeltaPx}px`,
      `${result.metrics.scrollPxPerSecond ?? "n/a"}`,
    ]),
  },
  {
    title: "Initial Render",
    headers: ["Grid", "Mode", "Rows", "FCP", "Full Render", "LCP", "TBT"],
    rows: run.results.initialRender.map((result) => [
      gridLink(result),
      result.implementationMode,
      formatRowCount(result.rowCount),
      `${result.metrics.timeToFirstPaint}ms`,
      `${result.metrics.timeToFullRender}ms`,
      `${result.metrics.largestContentfulPaint}ms`,
      `${result.metrics.totalBlockingTime}ms`,
    ]),
  },
  {
    title: "Sort/Filter Performance",
    headers: [
      "Grid",
      "Mode",
      "Rows",
      "Sort Asc",
      "Sort Desc",
      "Multi Sort",
      "Text Filter",
      "Number Filter",
    ],
    rows: run.results.sortFilter.map((result) => [
      gridLink(result),
      result.implementationMode,
      formatRowCount(result.rowCount),
      `${result.metrics.sortAscTime}ms`,
      `${result.metrics.sortDescTime}ms`,
      `${result.metrics.multiColumnSortTime}ms`,
      `${result.metrics.textFilterTime}ms`,
      `${result.metrics.numberFilterTime}ms`,
    ]),
  },
  {
    title: "Memory Usage",
    headers: [
      "Grid",
      "Mode",
      "Rows",
      "After Load",
      "Peak",
      "After Scroll",
      "Growth / 1K",
      "Retained",
    ],
    rows: run.results.memoryUsage.map((result) => [
      gridLink(result),
      result.implementationMode,
      formatRowCount(result.rowCount),
      formatMB(result.metrics.afterDataLoadHeapSizeMB),
      formatMB(result.metrics.peakHeapSizeMB),
      formatMB(result.metrics.afterScrollHeapSizeMB),
      formatMB(result.metrics.heapGrowthRateMBPer1KRows),
      formatMB(result.metrics.retainedAfterClearMB),
    ]),
  },
];

// The per-grid fairness notes are identical across every category, so they are
// collected once and emitted in a single section at the end of the report.
const collectNotes = (run) => {
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

const markdownCell = (cell) => {
  if (typeof cell === "object" && cell.url) {
    return `[${cell.label}](${cell.url})`;
  }
  if (typeof cell === "object" && cell.code) {
    return `\`${cell.code}\``;
  }
  if (typeof cell === "object" && cell.codes) {
    return cell.codes.map((code) => `\`${code}\``).join(", ");
  }
  return String(cell);
};

// Body shared by the archive summary (H1 + body) and the docs partial (body
// only — the docs page owns the H1 and includes the partial verbatim).
const buildMarkdownBody = (run) => {
  const lines = [];

  // List items rather than bare lines so each entry renders as its own line
  // instead of merging into one paragraph.
  for (const [label, value] of buildMetaEntries(run)) {
    lines.push(`- **${label}:** ${value}`);
  }
  lines.push("");

  for (const section of buildSections(run)) {
    if (section.rows.length === 0) {
      continue;
    }
    lines.push(`## ${section.title}`, "");
    if (section.note) {
      lines.push(section.note, "");
    }
    lines.push(`| ${section.headers.join(" | ")} |`);
    lines.push(`| ${section.headers.map(() => "---").join(" | ")} |`);
    for (const row of section.rows) {
      lines.push(`| ${row.map(markdownCell).join(" | ")} |`);
    }
    lines.push("");
  }

  const notes = collectNotes(run);
  if (notes.length > 0) {
    lines.push("## Notes", "");
    for (const { grid, comment } of notes) {
      lines.push(`- **${grid}:** ${comment}`);
    }
    lines.push("");
  }

  lines.push(...buildReproduceLines());

  return lines;
};

const generateMarkdownSummary = (run) => {
  return ["# gp-grid Benchmark Results", "", ...buildMarkdownBody(run)].join("\n");
};

// Markdown partial for the gp-grid-docs benchmarks page: the docs copy it via
// their sync-benchmarks script and inline it with fumadocs' <include>, so the
// tables ship as server-rendered HTML that crawlers and AI bots can read.
const generateMarkdownPartial = (run) => {
  return buildMarkdownBody(run).join("\n");
};

console.log("Generating benchmark report...");

const run = loadRun();
const jsonReport = {
  runId: run.runId,
  timestamp: run.timestamp,
  environment: run.environment,
  config: run.config,
  libraryVersions: run.libraryVersions,
  packageSizes: run.packageSizes,
  results: run.results,
};
const markdown = generateMarkdownSummary(run);
const partial = generateMarkdownPartial(run);

const jsonPath = path.join(run.runDir, "benchmark-report.json");
const mdPath = path.join(run.runDir, "BENCHMARK-RESULTS.mdx");
const partialPath = path.join(run.runDir, "benchmark-results.md");
fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
fs.writeFileSync(mdPath, markdown);
fs.writeFileSync(partialPath, partial);
fs.writeFileSync(path.join(RESULTS_DIR, "benchmark-report.json"), JSON.stringify(jsonReport, null, 2));
fs.writeFileSync(path.join(RESULTS_DIR, "BENCHMARK-RESULTS.mdx"), markdown);
fs.writeFileSync(path.join(RESULTS_DIR, "benchmark-results.md"), partial);

console.log(`JSON report saved to: ${jsonPath}`);
console.log(`MDX report saved to: ${mdPath}`);
console.log(`Docs markdown partial saved to: ${partialPath}`);
console.log("");
console.log(markdown);
