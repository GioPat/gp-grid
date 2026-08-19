// Re-generate summary.md/summary.json for an existing run directory:
//   pnpm --filter ./profiling report <runDir>
// With no argument, the most recent run under profiling/results is used.

import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { RESULTS_ROOT } from "./config";
import { generateReport } from "./report/index";

const latestRunDir = (): string => {
  const runs = readdirSync(RESULTS_ROOT)
    .map((name) => path.join(RESULTS_ROOT, name))
    .filter((dir) => statSync(dir).isDirectory())
    .sort();
  const latest = runs[runs.length - 1];
  if (latest === undefined) throw new Error(`no runs under ${RESULTS_ROOT}`);
  return latest;
};

const runDir = process.argv[2] === undefined ? latestRunDir() : path.resolve(process.argv[2]);

generateReport(runDir).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
