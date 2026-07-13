import * as fs from "fs";
import * as path from "path";
import {
  GRID_METADATA,
  type BenchmarkResult,
  type BenchmarkRun,
  type GridType,
  type MemoryMetrics,
  type RenderMetrics,
  type ScrollMetrics,
  type SortFilterMetrics,
} from "../data/types";
import { calculateMedianMetrics, calculateMetricStats } from "./stats";
import { getRunDir, getRunManifest } from "./run-context";

type BenchmarkCategory = "scroll" | "render" | "sort" | "memory";

interface SaveResultOptions {
  browserVersion?: string;
}

const categoryToResultKey: Record<
  BenchmarkCategory,
  keyof BenchmarkRun["results"]
> = {
  scroll: "scrollPerformance",
  render: "initialRender",
  sort: "sortFilter",
  memory: "memoryUsage",
};

export const saveResult = <T extends object>(
  category: BenchmarkCategory,
  grid: GridType,
  rowCount: number,
  samples: T[],
  options: SaveResultOptions = {},
): BenchmarkResult<T> => {
  const manifest = getRunManifest(options.browserVersion);
  const runDir = getRunDir(manifest);
  const metadata = GRID_METADATA[grid];
  const metrics = calculateMedianMetrics(samples);

  const result: BenchmarkResult<T> = {
    runId: manifest.runId,
    grid,
    displayName: metadata.displayName,
    websiteUrl: metadata.websiteUrl,
    implementationMode: metadata.implementationMode,
    comment: metadata.comment,
    rowCount,
    metrics,
    samples,
    stats: calculateMetricStats(samples),
    iterations: samples.length,
    timestamp: new Date().toISOString(),
  };

  const filename = `${category}-${grid}-${rowCount}.json`;
  const filepath = path.join(runDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));

  return result;
};

const loadResultsByCategory = <T>(
  files: string[],
  runDir: string,
  prefix: string,
): BenchmarkResult<T>[] => {
  return files
    .filter((file) => file.startsWith(prefix))
    .map((file) => {
      const filepath = path.join(runDir, file);
      return JSON.parse(fs.readFileSync(filepath, "utf-8")) as BenchmarkResult<T>;
    });
};

export const loadAllResults = (): BenchmarkRun => {
  const manifest = getRunManifest();
  const runDir = getRunDir(manifest);
  const files = fs
    .readdirSync(runDir)
    .filter((file) => file.endsWith(".json") && file !== "run-manifest.json");

  return {
    runId: manifest.runId,
    timestamp: manifest.timestamp,
    environment: manifest.environment,
    config: manifest.config,
    results: {
      scrollPerformance: loadResultsByCategory<ScrollMetrics>(
        files,
        runDir,
        "scroll-",
      ),
      initialRender: loadResultsByCategory<RenderMetrics>(
        files,
        runDir,
        "render-",
      ),
      sortFilter: loadResultsByCategory<SortFilterMetrics>(
        files,
        runDir,
        "sort-",
      ),
      memoryUsage: loadResultsByCategory<MemoryMetrics>(
        files,
        runDir,
        "memory-",
      ),
    },
  };
};

export const generateReport = (): BenchmarkRun => {
  const run = loadAllResults();
  const runDir = getRunDir({ runId: run.runId });
  const reportPath = path.join(runDir, "benchmark-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(run, null, 2));
  return run;
};

export const resultKeyForCategory = (
  category: BenchmarkCategory,
): keyof BenchmarkRun["results"] => {
  return categoryToResultKey[category];
};
