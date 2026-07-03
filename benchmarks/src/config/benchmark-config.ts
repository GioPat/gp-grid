// Import attribute is required: this module is loaded by Node (Playwright config,
// tests, start-run) through the ESM loader, which mandates `with { type: "json" }`.
import benchmarkDefaults from "./benchmark-defaults.json" with { type: "json" };

export const PLAYWRIGHT_WORKERS = benchmarkDefaults.playwrightWorkers;
export const PLAYWRIGHT_RETRIES = benchmarkDefaults.retries;
export const OVERSCAN_ROWS = benchmarkDefaults.overscanRows;
export const VIEWPORT = benchmarkDefaults.viewport;
export const HEADLESS = benchmarkDefaults.headless;

const parsePositiveInteger = (value: string | undefined): number | null => {
  if (value === undefined) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return null;
};

const parsePositiveIntegerList = (value: string | undefined): number[] | null => {
  if (value === undefined) {
    return null;
  }

  const parsed = value
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isFinite(entry) && entry > 0);

  if (parsed.length > 0) {
    return parsed;
  }

  return null;
};

export const getBenchmarkIterations = (): number => {
  return parsePositiveInteger(process.env.BENCH_ITERATIONS) ?? benchmarkDefaults.iterations;
};

export const getBenchmarkRowCounts = (): number[] => {
  return (
    parsePositiveIntegerList(process.env.BENCH_ROW_COUNTS) ??
    [...benchmarkDefaults.rowCounts]
  );
};
