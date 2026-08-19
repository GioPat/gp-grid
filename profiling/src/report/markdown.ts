// Render summary.md for a run directory.

import path from "node:path";
import type { RunManifest } from "../run-manifest";
import type { ArtifactSummary } from "./summary";

const ms = (value: number): string => value.toFixed(2);
const pct = (value: number): string => `${value.toFixed(1)}%`;

const table = (header: string[], rows: string[][]): string => {
  const line = (cells: string[]): string => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
};

// Repo files → path from the repo root; dependencies → path from the last
// node_modules segment (drops the pnpm store prefix).
const shortFile = (file: string): string => {
  const normalized = file.replaceAll("\\", "/");
  const nodeModules = normalized.lastIndexOf("/node_modules/");
  if (nodeModules >= 0) return normalized.slice(nodeModules + "/node_modules/".length);
  const marker = ["/packages/", "/playgrounds/", "/benchmarks/"].find((m) => normalized.includes(m));
  if (marker === undefined) return normalized;
  return normalized.slice(normalized.indexOf(marker) + 1);
};

const renderBuckets = (summary: ArtifactSummary): string =>
  table(
    ["Layer", "Self time (ms)", "% of active"],
    summary.buckets
      .filter((row) => row.selfMs > 0)
      .map((row) => [row.label, ms(row.selfMs), row.bucket === "idle" ? "—" : pct(row.percentOfActive)]),
  );

const renderTopFunctions = (summary: ArtifactSummary): string =>
  table(
    ["#", "Function", "Layer", "Self (ms)", "Total (ms)", "% self", "Source"],
    summary.topFunctions.map((row, index) => [
      String(index + 1),
      `\`${row.name}\``,
      row.bucket,
      ms(row.selfMs),
      ms(row.totalMs),
      pct(row.percentOfActive),
      row.line === null ? shortFile(row.file) : `${shortFile(row.file)}:${row.line}`,
    ]),
  );

const renderMeasures = (summary: ArtifactSummary): string =>
  table(
    ["Span", "Count", "Total (ms)", "Mean (ms)", "p95 (ms)", "Max (ms)"],
    summary.measures.map((row) => [
      `\`${row.name}\``,
      String(row.count),
      ms(row.totalMs),
      ms(row.meanMs),
      ms(row.p95Ms),
      ms(row.maxMs),
    ]),
  );

const renderArtifact = (summary: ArtifactSummary): string => {
  const parts: string[] = [`## ${summary.name} (${summary.capture})`, ""];
  if (summary.capture === "cpuprofile") {
    parts.push(
      `Sampled ${ms(summary.durationMs)} ms wall time, ${ms(summary.activeMs)} ms active (non-idle).`,
      "",
      "### Self time by layer",
      "",
      renderBuckets(summary),
      "",
      "### Hottest functions (self time)",
      "",
      renderTopFunctions(summary),
      "",
    );
  }
  if (summary.measures.length > 0) {
    parts.push("### User Timing spans", "", renderMeasures(summary), "");
  }
  return parts.join("\n");
};

export const renderSummaryMarkdown = (
  runDir: string,
  manifest: RunManifest,
  summaries: ArtifactSummary[],
): string => {
  const reproduce = [
    "pnpm --filter ./profiling profile",
    `--framework ${manifest.framework}`,
    `--scenario ${manifest.scenarios.join(",")}`,
    `--rows ${manifest.rows}`,
    `--capture ${manifest.captures.join(",")}`,
    manifest.iterations > 1 ? `--iterations ${manifest.iterations}` : "",
  ]
    .filter((part) => part.length > 0)
    .join(" ");

  return [
    `# gp-grid profile — ${manifest.framework} — ${manifest.createdAt}`,
    "",
    `- Rows: ${manifest.rows.toLocaleString("en-US")}`,
    `- Chrome ${manifest.chromeVersion}, Node ${manifest.node}, ${manifest.platform}`,
    `- CPU: ${manifest.cpu}`,
    `- Git: ${manifest.git.sha ?? "unknown"}${manifest.git.dirty === true ? " (dirty)" : ""}`,
    `- Target: ${manifest.baseUrl}${manifest.served ? " (built and served by the harness)" : " (external server)"}`,
    `- Results: \`${path.basename(runDir)}\``,
    "",
    "Open a `.cpuprofile` with `pnpm dlx speedscope <file>` (Left Heavy = aggregated flamegraph, Sandwich = callers/callees of one function) or load it — or a `.trace.json` — in Chrome DevTools → Performance → Load profile.",
    "",
    "Reproduce:",
    "",
    "```",
    reproduce,
    "```",
    "",
    ...summaries.map(renderArtifact),
  ].join("\n");
};
