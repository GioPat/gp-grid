// JSON reporter for benchmark results

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type {
  BenchmarkResult,
  BenchmarkRun,
  GridType,
  MemoryMetrics,
  RenderMetrics,
  ScrollMetrics,
  SortFilterMetrics,
} from "../data/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESULTS_DIR = path.join(__dirname, "../../results");

// Ensure results directory exists
function ensureResultsDir(): void {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
}

// Save individual benchmark result
export function saveResult<T>(
  category: "scroll" | "render" | "sort" | "memory",
  grid: GridType,
  rowCount: number,
  metrics: T,
): void {
  ensureResultsDir();

  const result: BenchmarkResult<T> = {
    grid,
    rowCount,
    metrics,
    timestamp: new Date().toISOString(),
  };

  const filename = `${category}-${grid}-${rowCount}.json`;
  const filepath = path.join(RESULTS_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
}

// Load all results from a benchmark run
export function loadAllResults(): BenchmarkRun {
  ensureResultsDir();

  const run: BenchmarkRun = {
    timestamp: new Date().toISOString(),
    environment: {
      os: process.platform,
      nodeVersion: process.version,
      chromeVersion: "unknown",
    },
    results: {
      scrollPerformance: [],
      initialRender: [],
      sortFilter: [],
      memoryUsage: [],
    },
  };

  const files = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    if (file === "benchmark-report.json") continue;

    const filepath = path.join(RESULTS_DIR, file);
    const content = fs.readFileSync(filepath, "utf-8");
    const result = JSON.parse(content) as BenchmarkResult<unknown>;

    if (file.startsWith("scroll-")) {
      run.results.scrollPerformance.push(
        result as BenchmarkResult<ScrollMetrics>,
      );
    } else if (file.startsWith("render-")) {
      run.results.initialRender.push(result as BenchmarkResult<RenderMetrics>);
    } else if (file.startsWith("sort-")) {
      run.results.sortFilter.push(result as BenchmarkResult<SortFilterMetrics>);
    } else if (file.startsWith("memory-")) {
      run.results.memoryUsage.push(result as BenchmarkResult<MemoryMetrics>);
    }
  }

  return run;
}

// Generate final benchmark report
export function generateReport(): BenchmarkRun {
  const run = loadAllResults();

  // Save combined report
  const reportPath = path.join(RESULTS_DIR, "benchmark-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(run, null, 2));

  return run;
}

// Generate markdown summary
export function generateMarkdownSummary(): string {
  const run = loadAllResults();
  const lines: string[] = [];

  lines.push("# gp-grid Benchmark Results");
  lines.push("");
  lines.push(`**Date:** ${run.timestamp}\n`);
  lines.push(`**Platform:** ${run.environment.os}\n`);
  lines.push(`**Node:** ${run.environment.nodeVersion}\n`);
  lines.push("");

  // Scroll Performance Table
  if (run.results.scrollPerformance.length > 0) {
    lines.push("## Scroll Performance");
    lines.push("");
    lines.push("| Grid | Rows | Avg FPS | Min FPS | Frame Drops | P95 FPS |");
    lines.push("|------|------|---------|---------|-------------|---------|");

    const sorted = [...run.results.scrollPerformance].sort(
      (a, b) => a.rowCount - b.rowCount || a.grid.localeCompare(b.grid),
    );

    for (const r of sorted) {
      lines.push(
        `| ${r.grid} | ${r.rowCount.toLocaleString()} | ${r.metrics.avgFPS} | ${r.metrics.minFPS} | ${r.metrics.frameDropCount} | ${r.metrics.percentile95FPS} |`,
      );
    }
    lines.push("");
  }

  // Initial Render Table
  if (run.results.initialRender.length > 0) {
    lines.push("## Initial Render");
    lines.push("");
    lines.push(
      "| Grid | Rows | First Paint (ms) | Full Render (ms) | LCP (ms) |",
    );
    lines.push(
      "|------|------|------------------|------------------|----------|",
    );

    const sorted = [...run.results.initialRender].sort(
      (a, b) => a.rowCount - b.rowCount || a.grid.localeCompare(b.grid),
    );

    for (const r of sorted) {
      lines.push(
        `| ${r.grid} | ${r.rowCount.toLocaleString()} | ${r.metrics.timeToFirstPaint} | ${r.metrics.timeToFullRender} | ${r.metrics.largestContentfulPaint} |`,
      );
    }
    lines.push("");
  }

  // Sort/Filter Table
  if (run.results.sortFilter.length > 0) {
    lines.push("## Sort/Filter Performance");
    lines.push("");
    lines.push(
      "| Grid | Rows | Sort Asc (ms) | Sort Desc (ms) | Text Filter (ms) | Number Filter (ms) |",
    );
    lines.push(
      "|------|------|---------------|----------------|------------------|--------------------|",
    );

    const sorted = [...run.results.sortFilter].sort(
      (a, b) => a.rowCount - b.rowCount || a.grid.localeCompare(b.grid),
    );

    for (const r of sorted) {
      lines.push(
        `| ${r.grid} | ${r.rowCount.toLocaleString()} | ${r.metrics.sortAscTime} | ${r.metrics.sortDescTime} | ${r.metrics.textFilterTime} | ${r.metrics.numberFilterTime} |`,
      );
    }
    lines.push("");
  }

  // Memory Usage Table
  if (run.results.memoryUsage.length > 0) {
    lines.push("## Memory Usage");
    lines.push("");
    lines.push(
      "| Grid | Rows | After Load (MB) | Peak (MB) | Growth (MB/1K rows) |",
    );
    lines.push(
      "|------|------|-----------------|-----------|---------------------|",
    );

    const sorted = [...run.results.memoryUsage].sort(
      (a, b) => a.rowCount - b.rowCount || a.grid.localeCompare(b.grid),
    );

    for (const r of sorted) {
      lines.push(
        `| ${r.grid} | ${r.rowCount.toLocaleString()} | ${r.metrics.afterDataLoadHeapSizeMB} | ${r.metrics.peakHeapSizeMB} | ${r.metrics.heapGrowthRateMBPer1KRows} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// Save markdown report
export function saveMarkdownReport(): void {
  ensureResultsDir();
  const markdown = generateMarkdownSummary();
  const filepath = path.join(RESULTS_DIR, "BENCHMARK-RESULTS.md");
  fs.writeFileSync(filepath, markdown);
}
