// Core-only evidence for PRD 015 (AC-015-01, AC-015-03): one transaction on a
// 1,000,000-row mutable source, then `refreshFromTransaction(result)`. An update
// must make no query and redraw only the mounted rows that changed; an add
// keeps the full refresh. Invariants are the guarantee; timings are figures.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GridCore, createMutableClientDataSource } from "../../packages/core/dist/index.js";
import { collectPackageProvenance } from "./artifact-resolution.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const ROW_COUNT = Number(process.env.BENCH_ROWS ?? 1_000_000);
const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 5);
const ROW_HEIGHT = 32;
const VIEWPORT = { width: 1200, height: ROW_HEIGHT * 31 };
const IN_WINDOW_ROW = 4;
const OUT_OF_WINDOW_ROW = Math.floor(ROW_COUNT / 2);

const columns = [
  { field: "id", cellDataType: "number", width: 80 },
  { field: "name", cellDataType: "text", width: 160, editable: true },
  { field: "price", cellDataType: "number", width: 120, editable: true },
  { field: "qty", cellDataType: "number", width: 120, editable: true },
];

const now = () => Number(process.hrtime.bigint()) / 1e6;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const round = (value) => Math.round(value * 100) / 100;

const invariants = [];
const check = (name, pass, detail) => {
  const entry = { name, pass: Boolean(pass), detail: String(detail ?? "") };
  invariants.push(entry);
  if (entry.pass === false) console.error(`  FAIL ${name}\n       ${entry.detail}`);
};

const makeRows = () =>
  Array.from({ length: ROW_COUNT }, (_, i) => ({ id: i + 1, name: `n${i}`, price: (i * 7919) % 100_000, qty: i % 50 }));

/** A grid over a counting wrapper of a fresh mutable source. */
const mountGrid = async (sorted) => {
  const source = createMutableClientDataSource(makeRows(), { getRowId: (row) => row.id, debounceMs: 0, useWorker: false });
  let queries = 0;
  const counted = {
    ...source,
    query: (request) => {
      queries += 1;
      return source.query(request);
    },
  };
  let last;
  source.subscribe((result) => {
    last = result;
  });
  let assigned = 0;
  const core = new GridCore({ columns, dataSource: counted, rowHeight: ROW_HEIGHT, headerHeight: ROW_HEIGHT, overscan: 12, getRowId: (row) => row.id });
  core.onBatchInstruction((batch) => {
    for (const instruction of batch) if (instruction.type === "ASSIGN_SLOT") assigned += 1;
  });
  await core.initialize();
  core.setViewport(0, 0, VIEWPORT.width, VIEWPORT.height);
  if (sorted) await core.sortFilter.setSort("price", "desc");
  const mounted = core.rows.getCount() === 0 ? 0 : assigned;
  const reset = () => {
    queries = 0;
    assigned = 0;
  };
  const refresh = async () => {
    const result = last;
    last = undefined;
    const start = now();
    await core.refreshFromTransaction(result);
    return now() - start;
  };
  return { core, source, refresh, reset, queries: () => queries, assigned: () => assigned, mounted };
};

/** One workload: `transact` runs on the source, then the refresh is timed. */
const sample = async (grid, transact) => {
  const times = [];
  const queries = [];
  const assigned = [];
  for (let i = 0; i < ITERATIONS; i++) {
    grid.reset();
    transact(i);
    await grid.source.flushTransactions();
    times.push(await grid.refresh());
    queries.push(grid.queries());
    assigned.push(grid.assigned());
  }
  return { medianMs: round(median(times)), times: times.map(round), queries, assigned };
};

const run = async () => {
  console.log(`Transaction smoke (${ROW_COUNT.toLocaleString()} rows, ${ITERATIONS} samples per workload)`);
  const cases = {};
  for (const sorted of [false, true]) {
    const grid = await mountGrid(sorted);
    const suffix = sorted ? " (sorted by price)" : "";
    // Ids by view index, so the rows sit where the sort put them.
    const inWindowId = grid.core.rows.getId(IN_WINDOW_ROW);
    const outOfWindowId = grid.core.rows.getId(OUT_OF_WINDOW_ROW);
    const inWindow = await sample(grid, (i) => grid.source.updateRow(inWindowId, { qty: 100 + i }));
    const outOfWindow = await sample(grid, (i) => grid.source.updateRow(outOfWindowId, { qty: 100 + i }));
    const add = await sample(grid, (i) => grid.source.addRows([{ id: ROW_COUNT + 100 + i, name: "new", price: 1, qty: 1 }]));
    const key = sorted ? "sorted" : "unsorted";
    cases[key] = { mountedSlots: grid.mounted, updateInWindow: inWindow, updateOutOfWindow: outOfWindow, add };
    check(`update in the window makes no query${suffix}`, inWindow.queries.every((n) => n === 0), `queries=${inWindow.queries.join("/")}`);
    check(`update in the window redraws one slot${suffix}`, inWindow.assigned.every((n) => n === 1), `assigned=${inWindow.assigned.join("/")}`);
    check(`update outside the window makes no query${suffix}`, outOfWindow.queries.every((n) => n === 0), `queries=${outOfWindow.queries.join("/")}`);
    check(`update outside the window emits no slot${suffix}`, outOfWindow.assigned.every((n) => n === 0), `assigned=${outOfWindow.assigned.join("/")}`);
    check(`add makes one query${suffix}`, add.queries.every((n) => n === 1), `queries=${add.queries.join("/")}`);
    check(`add shows the new row${suffix}`, grid.core.rows.getCount() === ROW_COUNT + ITERATIONS, `rows=${grid.core.rows.getCount()}`);
    console.log(
      `  ${key}: update in window ${inWindow.medianMs} ms, update out of window ${outOfWindow.medianMs} ms, add (full refresh) ${add.medianMs} ms`,
    );
    grid.core.destroy();
  }

  const coreEntry = resolve(repoRoot, "packages", "core", "dist", "index.js");
  const buildProfile = existsSync(`${coreEntry}.map`) ? "development" : "production";
  check("core build is production", buildProfile === "production", `buildProfile=${buildProfile}`);
  const provenance = { ...collectPackageProvenance(["@gp-grid/core"], "candidate"), buildProfile };
  const runId = process.env.BENCH_RUN_ID ?? `prd015-transaction-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const outDir = resolve(repoRoot, "benchmarks", "results", "runs", runId);
  const outFile = resolve(outDir, "transaction-smoke.json");
  if (existsSync(outFile)) {
    throw new Error(`Transaction smoke output already exists and will not be overwritten: ${outFile}. Use a unique BENCH_RUN_ID.`);
  }
  const failures = invariants.filter((entry) => entry.pass === false);
  const results = {
    runId,
    generatedAt: new Date().toISOString(),
    scope: "core-only",
    note:
      "Invariants are the guarantee; timings are figures. Each sample is one transaction on the mutable source, " +
      "flushed, then one refreshFromTransaction(result) timed; queries count the source's query calls and " +
      "assigned the ASSIGN_SLOT instructions during the refresh.",
    provenance,
    environment: {
      os: `${os.platform()} ${os.release()}`,
      node: process.version,
      cpuModel: os.cpus().at(0)?.model ?? "unknown",
      logicalCpuCount: os.cpus().length,
      totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
    },
    workload: { rowCount: ROW_COUNT, iterations: ITERATIONS, viewport: VIEWPORT, statistic: "median" },
    failedInvariants: failures,
    invariants,
    cases,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  if (failures.length > 0) {
    console.error(`\n${failures.length} transaction smoke invariant(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${invariants.length} transaction smoke invariants passed.`);
  }
  console.log("Written to " + outFile);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
