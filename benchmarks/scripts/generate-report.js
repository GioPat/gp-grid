#!/usr/bin/env node

// Generate benchmark report from collected results

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, "../results");

function loadAllResults() {
  const run = {
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

  if (!fs.existsSync(RESULTS_DIR)) {
    console.log("No results directory found.");
    return run;
  }

  const files = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    if (file === "benchmark-report.json" || file === "playwright-report.json") {
      continue;
    }

    const filepath = path.join(RESULTS_DIR, file);
    const content = fs.readFileSync(filepath, "utf-8");
    const result = JSON.parse(content);

    if (file.startsWith("scroll-")) {
      run.results.scrollPerformance.push(result);
    } else if (file.startsWith("render-")) {
      run.results.initialRender.push(result);
    } else if (file.startsWith("sort-")) {
      run.results.sortFilter.push(result);
    } else if (file.startsWith("memory-")) {
      run.results.memoryUsage.push(result);
    }
  }

  return run;
}

// Group results by row count
function groupByRowCount(results) {
  const grouped = {};
  for (const r of results) {
    if (!grouped[r.rowCount]) {
      grouped[r.rowCount] = [];
    }
    grouped[r.rowCount].push(r);
  }
  // Sort each group by grid name
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => a.grid.localeCompare(b.grid));
  }
  return grouped;
}

// Format row count for display
function formatRowCount(count) {
  if (count >= 1_000_000) return `${count / 1_000_000}M`;
  if (count >= 1_000) return `${count / 1_000}K`;
  return count.toString();
}

function generateMarkdownSummary(run) {
  const lines = [];

  lines.push("# gp-grid Benchmark Results");
  lines.push("");
  lines.push(`**Date:** ${run.timestamp}\n`);
  lines.push(`**Platform:** ${run.environment.os}\n`);
  lines.push(`**Node:** ${run.environment.nodeVersion}\n`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Scroll Performance
  if (run.results.scrollPerformance.length > 0) {
    lines.push("## Scroll Performance");
    lines.push("");
    lines.push("| Metric | Higher/Lower is Better |");
    lines.push("|--------|------------------------|");
    lines.push("| Avg FPS | ⬆️ Higher is better |");
    lines.push("| Min FPS | ⬆️ Higher is better |");
    lines.push("| Frame Drops | ⬇️ Lower is better |");
    lines.push("| P95 FPS | ⬆️ Higher is better |");
    lines.push("");

    const grouped = groupByRowCount(run.results.scrollPerformance);
    const rowCounts = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b);

    for (const rowCount of rowCounts) {
      const results = grouped[rowCount];
      lines.push(`### ${formatRowCount(rowCount)} Rows\n`);
      lines.push("<table>\n  <thead>\n    <tr>");
      lines.push(
        "      <th>Grid</th>\n      <th>Avg FPS </th>\n      <th>Min FPS </th>\n      <th>Frame Drops </th>\n      <th>P95 FPS </th>",
      );
      lines.push("    </tr>\n  </thead>");
      lines.push("  <tbody>");
      for (const r of results) {
        lines.push(
          `    <tr ${r.grid === "gp-grid" ? 'className="gp-grid-highlight"' : ""}>`,
        );
        lines.push(
          `      <td>**${r.grid}**</td>\n      <td>${r.metrics.avgFPS}</td>\n      <td>${r.metrics.minFPS}</td>\n      <td>${r.metrics.frameDropCount}</td>\n      <td>${r.metrics.percentile95FPS}</td>`,
        );
        lines.push("    </tr>");
      }
      lines.push("  </tbody>\n</table>\n");
    }
  }

  // Initial Render
  if (run.results.initialRender.length > 0) {
    lines.push("## Initial Render");
    lines.push("");
    lines.push("| Metric | Higher/Lower is Better |");
    lines.push("|--------|------------------------|");
    lines.push("| First Paint | ⬇️ Lower is better |");
    lines.push("| Full Render | ⬇️ Lower is better |");
    lines.push("| LCP | ⬇️ Lower is better |");
    lines.push("| TBT | ⬇️ Lower is better |");
    lines.push("");

    const grouped = groupByRowCount(run.results.initialRender);
    const rowCounts = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b);

    for (const rowCount of rowCounts) {
      const results = grouped[rowCount];
      lines.push(`### ${formatRowCount(rowCount)} Rows\n`);
      lines.push("<table>\n  <thead>\n    <tr>");
      lines.push(
        "      <th>Grid</th>\n      <th>First Paint </th>\n      <th>Full Render </th>\n      <th>LCP </th>\n      <th>TBT </th>",
      );
      lines.push("    </tr>\n  </thead>");
      lines.push("  <tbody>");
      for (const r of results) {
        lines.push(
          `    <tr ${r.grid === "gp-grid" ? 'className="gp-grid-highlight"' : ""}>`,
        );
        lines.push(
          `      <td>**${r.grid}**</td>\n      <td>${r.metrics.timeToFirstPaint}ms</td>\n      <td>${r.metrics.timeToFullRender}ms</td>\n      <td>${r.metrics.largestContentfulPaint}ms</td>\n      <td>${r.metrics.totalBlockingTime}ms</td>`,
        );
        lines.push("    </tr>");
      }
      lines.push("  </tbody>\n</table>\n");
    }
  }

  // Sort/Filter Performance
  if (run.results.sortFilter.length > 0) {
    lines.push("## Sort/Filter Performance");
    lines.push("");
    lines.push("| Metric | Higher/Lower is Better |");
    lines.push("|--------|------------------------|");
    lines.push("| All timing metrics | ⬇️ Lower is better |");
    lines.push("");

    const grouped = groupByRowCount(run.results.sortFilter);
    const rowCounts = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b);

    for (const rowCount of rowCounts) {
      const results = grouped[rowCount];
      lines.push(`### ${formatRowCount(rowCount)} Rows\n`);
      lines.push("<table>\n  <thead>\n    <tr>");
      lines.push(
        "      <th>Grid</th>\n      <th>Sort Asc </th>\n      <th>Sort Desc </th>\n      <th>Text Filter </th>\n      <th>Number Filter </th>",
      );
      lines.push("    </tr>\n  </thead>");
      lines.push("  <tbody>");
      for (const r of results) {
        lines.push(
          `    <tr ${r.grid === "gp-grid" ? 'className="gp-grid-highlight"' : ""}>`,
        );
        lines.push(
          `      <td>**${r.grid}**</td>\n      <td>${r.metrics.sortAscTime}ms</td>\n      <td>${r.metrics.sortDescTime}ms</td>\n      <td>${r.metrics.textFilterTime}ms</td>\n      <td>${r.metrics.numberFilterTime}ms</td>`,
        );
        lines.push("    </tr>");
      }
      lines.push("  </tbody>\n</table>\n");
    }
  }

  // Memory Usage
  if (run.results.memoryUsage.length > 0) {
    lines.push("## Memory Usage");
    lines.push("");
    lines.push("| Metric | Higher/Lower is Better |");
    lines.push("|--------|------------------------|");
    lines.push("| After Load | ⬇️ Lower is better |");
    lines.push("| Peak | ⬇️ Lower is better |");
    lines.push("| Growth Rate | ⬇️ Lower is better |");
    lines.push("| Retained | ⬇️ Lower is better |");
    lines.push("");

    const grouped = groupByRowCount(run.results.memoryUsage);
    const rowCounts = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b);

    for (const rowCount of rowCounts) {
      const results = grouped[rowCount];
      lines.push(`### ${formatRowCount(rowCount)} Rows\n`);
      lines.push("<table>\n  <thead>\n    <tr>");
      lines.push(
        "      <th>Grid</th>\n      <th>After Load </th>\n      <th>Peak </th>\n      <th>Growth (MB/1K) </th>\n      <th>Retained </th>",
      );
      lines.push("    </tr>\n  </thead>");
      lines.push("  <tbody>");
      for (const r of results) {
        lines.push(
          `    <tr ${r.grid === "gp-grid" ? 'className="gp-grid-highlight"' : ""}>`,
        );
        lines.push(
          `      <td>**${r.grid}**</td>\n      <td>${r.metrics.afterDataLoadHeapSizeMB}MB</td>\n      <td>${r.metrics.peakHeapSizeMB}MB</td>\n      <td>${r.metrics.heapGrowthRateMBPer1KRows}</td>\n      <td>${r.metrics.retainedAfterClearMB}MB</td>`,
        );
        lines.push("    </tr>");
      }
      lines.push("  </tbody>\n</table>\n");
    }
  }

  // Summary section
  lines.push("---");
  lines.push("");
  lines.push("## Legend");
  lines.push("");
  lines.push(
    "- ⬆️ **Higher is better** - For these metrics, larger values indicate better performance",
  );
  lines.push(
    "- ⬇️ **Lower is better** - For these metrics, smaller values indicate better performance",
  );
  lines.push("");
  lines.push("### Metrics Explained");
  lines.push("");
  lines.push("| Metric | Description |");
  lines.push("|--------|-------------|");
  lines.push("| **Avg FPS** | Average frames per second during scroll |");
  lines.push("| **Min FPS** | Minimum FPS observed (worst case) |");
  lines.push("| **Frame Drops** | Number of frames that took >25ms |");
  lines.push("| **P95 FPS** | 95th percentile FPS (excludes outliers) |");
  lines.push("| **First Paint** | Time to first contentful paint |");
  lines.push("| **Full Render** | Time until grid is fully interactive |");
  lines.push("| **LCP** | Largest Contentful Paint |");
  lines.push("| **TBT** | Total Blocking Time |");
  lines.push("| **After Load** | Heap size after data is loaded |");
  lines.push("| **Peak** | Maximum heap size during operation |");
  lines.push("| **Growth Rate** | Memory increase per 1000 rows |");
  lines.push("| **Retained** | Memory not released after clearing data |");
  lines.push("");

  return lines.join("\n");
}

// Main
console.log("Generating benchmark report...");

const run = loadAllResults();

// Save JSON report
const jsonPath = path.join(RESULTS_DIR, "benchmark-report.json");
fs.writeFileSync(jsonPath, JSON.stringify(run, null, 2));
console.log(`JSON report saved to: ${jsonPath}`);

// Save Markdown report
const markdown = generateMarkdownSummary(run);
const mdPath = path.join(RESULTS_DIR, "BENCHMARK-RESULTS.mdx");
fs.writeFileSync(mdPath, markdown);
console.log(`MDX report saved to: ${mdPath}`);

// Print summary
console.log("\n" + markdown);
