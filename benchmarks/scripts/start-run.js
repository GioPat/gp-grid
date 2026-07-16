#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import benchmarkDefaults from "../src/config/benchmark-defaults.json" with { type: "json" };
import gridPackages from "../src/config/grid-packages.json" with { type: "json" };
import { collectPackageSizes } from "./collect-package-sizes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, "../results");
const RUNS_DIR = path.join(RESULTS_DIR, "runs");
const ACTIVE_RUN_FILE = path.join(RESULTS_DIR, "current-run.json");
const NODE_MODULES = path.join(__dirname, "../node_modules");

// Resolved version straight from the installed package manifest, not the
// declared range, so the run records exactly what executed.
const readPackageVersion = (packageName) => {
  try {
    const manifestPath = path.join(NODE_MODULES, packageName, "package.json");
    const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
};

const collectLibraryVersions = () => {
  const versions = {};
  for (const [grid, packageNames] of Object.entries(gridPackages)) {
    const packages = {};
    for (const name of packageNames) {
      packages[name] = readPackageVersion(name);
    }
    versions[grid] = { packages };
  }
  return versions;
};

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseRowCounts = () => {
  const raw = process.env.BENCH_ROW_COUNTS;
  if (raw === undefined) {
    return benchmarkDefaults.rowCounts;
  }

  const parsed = raw
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isFinite(entry) && entry > 0);

  return parsed.length > 0 ? parsed : benchmarkDefaults.rowCounts;
};

const createRunId = () => {
  return process.env.BENCH_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
};

fs.mkdirSync(RUNS_DIR, { recursive: true });

const cpus = os.cpus();
const runId = createRunId();
const manifest = {
  runId,
  timestamp: new Date().toISOString(),
  environment: {
    os: `${os.platform()} ${os.release()}`,
    nodeVersion: process.version,
    chromeVersion: "unknown",
    cpuModel: cpus.at(0)?.model ?? "unknown",
    logicalCpuCount: cpus.length,
    totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
  },
  config: {
    rowCounts: parseRowCounts(),
    iterations: parsePositiveInteger(
      process.env.BENCH_ITERATIONS,
      benchmarkDefaults.iterations,
    ),
    rowHeightPx: benchmarkDefaults.rowHeightPx,
    playwrightWorkers: benchmarkDefaults.playwrightWorkers,
    retries: benchmarkDefaults.retries,
    overscanRows: benchmarkDefaults.overscanRows,
    viewport: benchmarkDefaults.viewport,
    headless: benchmarkDefaults.headless,
  },
  libraryVersions: collectLibraryVersions(),
  packageSizes: await collectPackageSizes(gridPackages),
};

const runDir = path.join(RUNS_DIR, runId);
fs.mkdirSync(runDir, { recursive: true });
fs.writeFileSync(ACTIVE_RUN_FILE, JSON.stringify(manifest, null, 2));
fs.writeFileSync(
  path.join(runDir, "run-manifest.json"),
  JSON.stringify(manifest, null, 2),
);

console.log(`Started benchmark run ${runId}`);
