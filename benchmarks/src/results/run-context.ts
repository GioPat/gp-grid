import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  HEADLESS,
  OVERSCAN_ROWS,
  PLAYWRIGHT_RETRIES,
  PLAYWRIGHT_WORKERS,
  VIEWPORT,
  getBenchmarkIterations,
  getBenchmarkRowCounts,
} from "../config/benchmark-config";
import type { RunManifest } from "../data/types";
import { collectLibraryVersions } from "./library-versions";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const RESULTS_DIR = path.join(__dirname, "../../results");
export const RUNS_DIR = path.join(RESULTS_DIR, "runs");
export const ACTIVE_RUN_FILE = path.join(RESULTS_DIR, "current-run.json");

const ensureDir = (dir: string): void => {
  if (fs.existsSync(dir)) {
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
};

const createRunId = (): string => {
  return new Date().toISOString().replace(/[:.]/g, "-");
};

const collectEnvironment = (chromeVersion = "unknown"): RunManifest["environment"] => {
  const cpus = os.cpus();
  const firstCpu = cpus.at(0);

  return {
    os: `${os.platform()} ${os.release()}`,
    nodeVersion: process.version,
    chromeVersion,
    cpuModel: firstCpu?.model ?? "unknown",
    logicalCpuCount: cpus.length,
    totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
  };
};

const createManifest = (chromeVersion?: string): RunManifest => {
  return {
    runId: process.env.BENCH_RUN_ID ?? createRunId(),
    timestamp: new Date().toISOString(),
    environment: collectEnvironment(chromeVersion),
    config: {
      rowCounts: getBenchmarkRowCounts(),
      iterations: getBenchmarkIterations(),
      playwrightWorkers: PLAYWRIGHT_WORKERS,
      retries: PLAYWRIGHT_RETRIES,
      overscanRows: OVERSCAN_ROWS,
      viewport: { ...VIEWPORT },
      headless: HEADLESS,
    },
    libraryVersions: collectLibraryVersions(),
  };
};

const writeManifest = (manifest: RunManifest): void => {
  ensureDir(RESULTS_DIR);
  ensureDir(path.join(RUNS_DIR, manifest.runId));
  fs.writeFileSync(ACTIVE_RUN_FILE, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(RUNS_DIR, manifest.runId, "run-manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
};

export const getRunManifest = (chromeVersion?: string): RunManifest => {
  ensureDir(RESULTS_DIR);
  ensureDir(RUNS_DIR);

  if (fs.existsSync(ACTIVE_RUN_FILE)) {
    const manifest = JSON.parse(
      fs.readFileSync(ACTIVE_RUN_FILE, "utf-8"),
    ) as RunManifest;

    if (chromeVersion && manifest.environment.chromeVersion === "unknown") {
      const updated = {
        ...manifest,
        environment: {
          ...manifest.environment,
          chromeVersion,
        },
      };
      writeManifest(updated);
      return updated;
    }

    return manifest;
  }

  const manifest = createManifest(chromeVersion);
  writeManifest(manifest);
  return manifest;
};

export const getRunDir = (manifest: Pick<RunManifest, "runId">): string => {
  const runDir = path.join(RUNS_DIR, manifest.runId);
  ensureDir(runDir);
  return runDir;
};
