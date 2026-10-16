// benchmarks/scripts/pivot-smoke.mjs
//
// Core-only evidence for PRD 012 (AC-012-01, AC-012-05): createPivotSource over a
// client data source of 1,000,000 object rows (see pivot-smoke-data.mjs), bound to
// a GridCore. Reported per workload: the query time through `core.initialize()`,
// the schema size, and the heap the pivot retains per non-empty intersection. The
// sparse workload pivots the same rows with twice the leaf tuples, half of them
// empty, so its retained heap must not exceed the dense one beyond a tolerance.
//
// Invariants exit nonzero: every row total of `sum(amount)` equals the sum of its
// cells; the grand total equals the sum of the region rows; the terminal rows are
// the cities present; the schema has (tuples + 1) x 2 generated leaf columns; the
// grid shows the grand total and the regions; the sparse retained heap stays within
// the tolerance. Timings and heap are figures, not gates. Retained memory counts
// `heapUsed + arrayBuffers` after gc.
//
// Usage:
//   pnpm test:pivot
//   BENCH_RUN_ID=my-run BENCH_ITERATIONS=5 node --expose-gc benchmarks/scripts/pivot-smoke.mjs

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GridCore,
  createClientDataSource,
  createPivotSource,
  decodePivotColumnId,
  encodePivotColumnId,
} from "../../packages/core/dist/index.js";
import { collectPackageProvenance } from "./artifact-resolution.js";
import { MEASURES, REGION_COUNT, ROW_COUNT, WORKLOADS, configOf, makeRows } from "./pivot-smoke-data.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 3);
const WARM_UP_SAMPLES = 1;
const ROW_HEIGHT = 32;
const VIEWPORT = { width: 1200, height: ROW_HEIGHT * 31 };
const EVERY_ROW = { startRow: 0, endRow: Number.MAX_SAFE_INTEGER };
// The sparse schema has 40 more column definitions and column groups than the dense one.
const SPARSE_TOLERANCE_BYTES = 512 * 1024;
const TOTAL_AMOUNT = encodePivotColumnId([], "amount");
const TOTAL_COUNT = encodePivotColumnId([], "count");

const now = () => Number(process.hrtime.bigint()) / 1e6;
const gc = () => {
  if (typeof globalThis.gc === "function") globalThis.gc();
};
const retained = () => {
  gc();
  gc();
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.arrayBuffers;
};
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

const invariants = [];
const check = (name, pass, detail) => {
  const entry = { name, pass: Boolean(pass), detail: String(detail ?? "") };
  invariants.push(entry);
  if (entry.pass === false) console.error(`  FAIL ${name}\n       ${entry.detail}`);
};

const groupCount = (schema) => {
  let count = 0;
  const pending = [...schema.columnGroups];
  for (let child = pending.pop(); child !== undefined; child = pending.pop()) {
    if (typeof child === "object") {
      count += 1;
      pending.push(...child.children);
    }
  }
  return count;
};

const sampleQuery = async (inner, config, schema) => {
  const source = createPivotSource(inner, config);
  const core = new GridCore({
    columns: schema.columns,
    columnGroups: schema.columnGroups,
    dataSource: source,
    rowHeight: ROW_HEIGHT,
  });
  const start = now();
  await core.initialize();
  const queryMs = now() - start;
  core.setViewport(0, 0, VIEWPORT.width, VIEWPORT.height);
  const gridRows = core.rows.getCount();
  core.destroy();
  source.destroy();
  return { queryMs, gridRows };
};

/** Reads every expanded row once and counts what the invariants need. */
const scanAccess = (access, cellIds) => {
  const amountCells = cellIds.filter((id) => decodePivotColumnId(id).measure === "amount");
  const countCells = cellIds.filter((id) => decodePivotColumnId(id).measure === "count");
  const regionSums = { amount: 0, count: 0 };
  let badTotals = 0;
  let terminalRows = 0;
  let nonEmpty = 0;
  for (let row = 0; row < access.rowCount; row += 1) {
    const view = access.getRow(row);
    const cellSum = amountCells.reduce((sum, id) => sum + (access.getValue(row, id) ?? 0), 0);
    if (cellSum !== (access.getValue(row, TOTAL_AMOUNT) ?? 0)) badTotals += 1;
    if (view.kind === "group" && view.depth === 0) {
      regionSums.amount += access.getValue(row, TOTAL_AMOUNT);
      regionSums.count += access.getValue(row, TOTAL_COUNT);
    }
    if (view.kind === "group" && view.childCount === 0) {
      terminalRows += 1;
      nonEmpty += countCells.filter((id) => access.getValue(row, id) !== null).length;
    }
  }
  return { badTotals, terminalRows, nonEmpty, regionSums };
};

const runWorkload = async (workload, inner, cityCount) => {
  const config = configOf(workload);
  const label = workload.name;
  const probe = createPivotSource(inner, config);
  await probe.query({ range: EVERY_ROW });
  const schema = probe.getSchema();
  probe.destroy();
  // Timed first, so the heap figure is taken on warm code.
  const samples = [];
  for (let warmUp = 0; warmUp < WARM_UP_SAMPLES; warmUp += 1) await sampleQuery(inner, config, schema);
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) samples.push(await sampleQuery(inner, config, schema));
  const base = retained();
  const source = createPivotSource(inner, config);
  const response = await source.query({ range: EVERY_ROW });
  const retainedBytes = retained() - base;
  const { access } = response;
  const cellIds = schema.columns.slice(1).map((column) => column.colId).filter((id) => decodePivotColumnId(id).path.length > 0);
  access.setExpanded(null, true);
  const scan = scanAccess(access, cellIds);
  const generated = schema.columns.length - 1;

  check(`${label} every sum row total equals the sum of its cells`, scan.badTotals === 0, `rows=${scan.badTotals}`);
  check(
    `${label} grand total equals the sum of the region rows`,
    access.getValue(0, TOTAL_AMOUNT) === scan.regionSums.amount && access.getValue(0, TOTAL_COUNT) === scan.regionSums.count,
    `amount ${access.getValue(0, TOTAL_AMOUNT)} vs ${scan.regionSums.amount}, count ${access.getValue(0, TOTAL_COUNT)} vs ${scan.regionSums.count}`,
  );
  check(`${label} terminal rows are the cities present`, scan.terminalRows === cityCount, `rows=${scan.terminalRows}`);
  check(
    `${label} schema has (tuples + 1) x 2 generated leaf columns`,
    generated === (workload.tupleCount + 1) * MEASURES.length,
    `generated=${generated} tuples=${workload.tupleCount}`,
  );
  source.destroy();

  const gridRows = samples[0].gridRows;
  check(`${label} grid shows the grand total and the regions`, gridRows === REGION_COUNT + 1, `rows=${gridRows}`);

  const result = {
    workload: label,
    description: workload.description,
    queryMs: median(samples.map((sample) => sample.queryMs)),
    rawQueryMs: samples.map((sample) => sample.queryMs),
    columns: schema.columns.length,
    generatedColumns: generated,
    groups: groupCount(schema),
    leafTuples: workload.tupleCount,
    nonEmptyIntersections: scan.nonEmpty,
    retainedBytes,
    bytesPerIntersection: retainedBytes / scan.nonEmpty,
  };
  console.log(
    `  ${label}: query ${result.queryMs.toFixed(0)} ms, ${result.columns} columns, ${result.groups} groups, ` +
      `${result.nonEmptyIntersections} intersections, retained ${mb(retainedBytes)} MB ` +
      `(${result.bytesPerIntersection.toFixed(0)} B per intersection)`,
  );
  return result;
};

const run = async () => {
  console.log(`Pivot smoke (${ROW_COUNT} rows, ${WARM_UP_SAMPLES} warm-up, ${ITERATIONS} samples per workload)`);
  const { rows, cityCount } = makeRows();
  const inner = createClientDataSource(rows, { useWorker: false });
  const cases = [];
  for (const workload of WORKLOADS) cases.push(await runWorkload(workload, inner, cityCount));
  const [dense, sparse] = cases;
  check(
    "sparse retained heap does not grow with empty tuples",
    sparse.retainedBytes <= dense.retainedBytes + SPARSE_TOLERANCE_BYTES,
    `sparse=${sparse.retainedBytes} dense=${dense.retainedBytes} tolerance=${SPARSE_TOLERANCE_BYTES}`,
  );

  const coreEntry = resolve(repoRoot, "packages", "core", "dist", "index.js");
  const buildProfile = existsSync(`${coreEntry}.map`) ? "development" : "production";
  check("core build is production", buildProfile === "production", `buildProfile=${buildProfile}`);
  const provenance = { ...collectPackageProvenance(["@gp-grid/core"], "candidate"), buildProfile };
  const runId = process.env.BENCH_RUN_ID ?? `prd012-pivot-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const outDir = resolve(repoRoot, "benchmarks", "results", "runs", runId);
  const outFile = resolve(outDir, "pivot-smoke.json");
  if (existsSync(outFile)) {
    throw new Error(`Pivot smoke output already exists and will not be overwritten: ${outFile}. Use a unique BENCH_RUN_ID.`);
  }

  const failures = invariants.filter((entry) => entry.pass === false);
  const results = {
    runId,
    generatedAt: new Date().toISOString(),
    scope: "core-only",
    note:
      "Invariants are the guarantee; timings and heap are figures. queryMs is core.initialize() over a fresh " +
      "pivot source, the inner client source's copy of the rows included. retainedBytes is heapUsed + arrayBuffers " +
      "after gc around one direct query, its response held.",
    provenance,
    environment: {
      os: `${os.platform()} ${os.release()}`,
      node: process.version,
      cpuModel: os.cpus().at(0)?.model ?? "unknown",
      logicalCpuCount: os.cpus().length,
      totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
    },
    workload: {
      rowCount: ROW_COUNT,
      measures: MEASURES,
      workloads: WORKLOADS,
      sparseToleranceBytes: SPARSE_TOLERANCE_BYTES,
      performance: { warmUpSamplesDiscarded: WARM_UP_SAMPLES, iterations: ITERATIONS, statistic: "median" },
    },
    failedInvariants: failures,
    invariants,
    cases,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  if (failures.length > 0) {
    console.error(`\n${failures.length} pivot smoke invariant(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${invariants.length} pivot smoke invariants passed.`);
  }
  console.log("Written to " + outFile);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
