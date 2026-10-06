// benchmarks/scripts/row-grouping-smoke.mjs
//
// Core-only evidence for PRD 008 (E4, AC-008-06): construction of the local
// grouping engine split into tree and aggregates, toggles, expand all, a toggle
// with application-set row heights, a measure edit, a dimension edit, a
// transaction refresh, record `locate`, and retained memory against the flat
// grid of the same data. Workloads: 100,000 and 1,000,000 rows; low cardinality
// (two dimensions, 20 x 50 groups) and high (one dimension, a group per two
// rows); object and columnar rows; one `sum` and one `avg` measure.
//
// Structural invariants exit nonzero: a toggle issues no query, keeps the leaf
// order and allocates no leaf-sized Int32Array; a flat core binds no hierarchy;
// the columnar run calls `getRecord` zero times. Timings and heap figures are
// secondary and noisy. Retained memory counts `heapUsed + arrayBuffers`, since
// the engine's typed arrays live outside the JS heap.
//
// Usage:
//   pnpm --filter @gp-grid/core build:production
//   node --expose-gc benchmarks/scripts/row-grouping-smoke.mjs
//   BENCH_RUN_ID=my-run BENCH_ITERATIONS=5 node --expose-gc benchmarks/scripts/row-grouping-smoke.mjs
//   BENCH_ROW_COUNTS=100000 node --expose-gc benchmarks/scripts/row-grouping-smoke.mjs
//
// Samples: one discarded warm-up, then BENCH_ITERATIONS (default 3) measured
// samples per case; the median and the raw samples are kept.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GridCore,
  createColumnarDataSource,
  createMutableClientDataSource,
  createRowGrouping,
} from "../../packages/core/dist/index.js";
import { collectPackageProvenance } from "./artifact-resolution.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const ROW_HEIGHT = 32;
const VIEWPORT = { width: 1200, height: 640 };
const TALL_ROW_HEIGHT = 64;
const HEIGHT_OVERRIDES = 100;
const SEQUENCE_LENGTH = 16;
const FLAGS = { toggleMs: 100, aggregatesMs: 250, atRows: 1000000 };

const FIELDS = ["id", "country", "city", "pair", "amount", "score"];
const COL = Object.fromEntries(FIELDS.map((field, index) => [field, index]));
const columns = FIELDS.map((field) => ({
  field,
  cellDataType: field === "amount" || field === "score" || field === "pair" ? "number" : "text",
  width: 120,
  editable: true,
}));

const MEASURES = [
  { field: "amount", aggregate: "sum" },
  { field: "score", aggregate: "avg" },
];
const CARDINALITIES = {
  low: { dimensions: [{ field: "country" }, { field: "city" }], groupsPer: (n) => 20 + Math.min(n, 1000) },
  high: { dimensions: [{ field: "pair" }], groupsPer: (n) => Math.ceil(n / 2) },
};

const countryOf = (i) => "c" + (i % 20);
const cityOf = (i) => "city" + (Math.floor(i / 20) % 50);
const pairOf = (i) => Math.floor(i / 2);
const amountOf = (i) => (i * 7919) % 1000;
const scoreOf = (i) => (i * 104729) % 100;
const idOf = (i) => "r" + i;

const now = () => Number(process.hrtime.bigint()) / 1e6;
const gc = () => {
  if (typeof globalThis.gc === "function") globalThis.gc();
};
const retained = () => {
  gc();
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.arrayBuffers;
};

const generateObjectRows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: idOf(i),
    country: countryOf(i),
    city: cityOf(i),
    pair: pairOf(i),
    amount: amountOf(i),
    score: scoreOf(i),
  }));

const generateColumns = (n) => {
  const data = {
    id: new Array(n),
    country: new Array(n),
    city: new Array(n),
    pair: new Int32Array(n),
    amount: new Float64Array(n),
    score: new Float64Array(n),
  };
  for (let i = 0; i < n; i += 1) {
    data.id[i] = idOf(i);
    data.country[i] = countryOf(i);
    data.city[i] = cityOf(i);
    data.pair[i] = pairOf(i);
    data.amount[i] = amountOf(i);
    data.score[i] = scoreOf(i);
  }
  return data;
};

/** Counts queries and record materializations in place, keeping getters intact. */
const instrument = (source) => {
  const counts = { queries: 0, records: 0 };
  const query = source.query.bind(source);
  source.query = (request) => {
    counts.queries += 1;
    return query(request);
  };
  if (typeof source.getRecord === "function") {
    const getRecord = source.getRecord.bind(source);
    source.getRecord = (row) => {
      counts.records += 1;
      return getRecord(row);
    };
  }
  return counts;
};

const createSource = (representation, n, columnar) => {
  if (representation === "object") {
    return createMutableClientDataSource(generateObjectRows(n), {
      getRowId: (row) => row.id,
      useWorker: false,
      debounceMs: 0,
    });
  }
  return createColumnarDataSource({
    rowCount: n,
    fields: FIELDS.map((field) => ({ field, data: columnar[field] })),
    getRowId: (row) => columnar.id[row],
  });
};

// Leaf-copy guard: counts Int32Array allocations at least as long as the leaf order.
const NativeInt32Array = Int32Array;
const leafCopies = { threshold: Infinity, count: 0 };
class CountingInt32Array extends NativeInt32Array {
  constructor(...args) {
    super(...args);
    if (this.length >= leafCopies.threshold) leafCopies.count += 1;
  }
}
for (const method of ["slice", "map", "filter"]) {
  const native = NativeInt32Array.prototype[method];
  NativeInt32Array.prototype[method] = function (...args) {
    const result = native.apply(this, args);
    if (result.length >= leafCopies.threshold) leafCopies.count += 1;
    return result;
  };
}
const countLeafCopies = (threshold, work) => {
  leafCopies.threshold = threshold;
  leafCopies.count = 0;
  globalThis.Int32Array = CountingInt32Array;
  try {
    work();
  } finally {
    globalThis.Int32Array = NativeInt32Array;
    leafCopies.threshold = Infinity;
  }
  return leafCopies.count;
};

const invariants = [];
const check = (name, pass, detail) => {
  const entry = { name, pass: Boolean(pass), detail: String(detail ?? "") };
  invariants.push(entry);
  if (entry.pass === false) console.error(`  FAIL ${name}\n       ${entry.detail}`);
};

const timed = (work) => {
  const start = now();
  work();
  return now() - start;
};
const timedAsync = async (work) => {
  const start = now();
  await work();
  return now() - start;
};

/** First view index, scanning from `fromEnd` when set, whose view row matches. */
const findRow = (core, match, fromEnd = false) => {
  const count = core.rows.getCount();
  for (let step = 0; step < count; step += 1) {
    const index = fromEnd ? count - 1 - step : step;
    const row = core.rows.getViewRow(index);
    if (row !== undefined && match(row)) return index;
  }
  return -1;
};
const groupWith = (field, value) => (row) => row.kind === "group" && row.field === field && row.value === value;
const groupIdWith = (core, field, value, fromEnd) =>
  core.rows.getId(findRow(core, groupWith(field, value), fromEnd));

const activeRow = (core) => core.selection.getActiveCell()?.row ?? -1;
const leafSequence = (core) => {
  const end = activeRow(core);
  const ids = [];
  for (let index = Math.max(0, end - SEQUENCE_LENGTH); index <= end; index += 1) ids.push(core.rows.getId(index));
  return ids.join("|");
};

const scrollToRow = (core, viewIndex) => {
  const target = core.geometry.getScrollTarget(viewIndex, 0, { scrollTop: 0, scrollLeft: 0 });
  core.setViewport(target.scrollTop ?? 0, 0, VIEWPORT.width, VIEWPORT.height);
};

/**
 * Opens the path to the last flat record and puts the active cell on it, scrolled
 * into view, so the D4 applier locates ids near the end of the flat rows.
 */
const focusLastRecord = (core, n, cardinality) => {
  const last = n - 1;
  const path =
    cardinality === "low"
      ? [groupIdWith(core, "country", countryOf(last))]
      : [groupIdWith(core, "pair", pairOf(last), true)];
  core.rowGroups.setExpanded(path, true);
  if (cardinality === "low") core.rowGroups.setExpanded([groupIdWith(core, "city", cityOf(last), true)], true);
  const index = findRow(core, (row) => row.kind === "record" && row.id === idOf(last), true);
  core.selection.setActiveCell(index, COL.amount);
  scrollToRow(core, index);
  return path;
};

const sampleCase = async ({ n, cardinality, representation, columnar }) => {
  const label = `n=${n} ${cardinality} ${representation}`;
  const spec = CARDINALITIES[cardinality];
  const source = createSource(representation, n, columnar);
  const counts = instrument(source);
  const base = retained();
  const core = new GridCore({
    columns,
    dataSource: source,
    rowHeight: ROW_HEIGHT,
    overscan: 3,
    ...(representation === "object" && { getRowId: (row) => row.id }),
  });
  await core.initialize();
  core.setViewport(0, 0, VIEWPORT.width, VIEWPORT.height);
  const flatRetainedBytes = retained() - base;
  check(`${label} flat core binds no hierarchy`, core.rowGroups.isActive() === false, "isActive() is true");

  const treeMs = timed(() => core.rowGroups.setGrouping(createRowGrouping({ dimensions: spec.dimensions })));
  core.rowGroups.setGrouping(null);
  const grouping = createRowGrouping({ dimensions: spec.dimensions, measures: MEASURES, grandTotal: "top" });
  let constructionMs = 0;
  const buildCopies = countLeafCopies(n, () => {
    constructionMs = timed(() => core.rowGroups.setGrouping(grouping));
  });
  check(`${label} leaf-copy guard sees the build's leaf order`, buildCopies > 0, `copies=${buildCopies}`);
  const groupedRetainedBytes = retained() - base;
  check(`${label} grouping binds`, core.rowGroups.isActive(), "isActive() is false");

  focusLastRecord(core, n, cardinality);
  const queries = counts.queries;

  // `toggle(recordId)` is one `locate` and no change. The last record was just read
  // through the active cell; the third-last is hidden and never read, so it scans.
  const locateScanMs = timed(() => core.rowGroups.toggle(idOf(n - 3)));
  const locateRecentMs = timed(() => core.rowGroups.toggle(idOf(n - 1)));

  const togglePath = groupIdWith(core, cardinality === "low" ? "country" : "pair", cardinality === "low" ? "c0" : 0);
  const sequence = leafSequence(core);
  let expandOneMs = 0;
  let collapseOneMs = 0;
  const toggleCopies = countLeafCopies(n, () => {
    expandOneMs = timed(() => core.rowGroups.toggle(togglePath));
    collapseOneMs = timed(() => core.rowGroups.toggle(togglePath));
  });
  check(`${label} toggle copies no leaf`, toggleCopies === 0, `copies=${toggleCopies}`);
  check(`${label} toggle keeps the leaf order`, leafSequence(core) === sequence, "leaf ids around the active row moved");

  const expandAllMs = timed(() => core.rowGroups.setExpanded(null, true));
  const expandedRowCount = core.rows.getCount();
  const collapseAllMs = timed(() => core.rowGroups.setExpanded(null, false));
  focusLastRecord(core, n, cardinality);

  const active = activeRow(core);
  const updates = [];
  for (let index = Math.max(0, active - HEIGHT_OVERRIDES + 1); index <= active; index += 1) {
    updates.push({ rowId: core.rows.getId(index), height: TALL_ROW_HEIGHT });
  }
  core.rowHeights.set(updates);
  const toggleWithHeightsMs = timed(() => core.rowGroups.toggle(togglePath));
  core.rowGroups.toggle(togglePath);
  check(`${label} toggles issue no query`, counts.queries === queries, `queries=${counts.queries - queries}`);
  check(`${label} toggles keep the active record`, core.rows.getId(activeRow(core)) === idOf(n - 1), "active row moved");

  const writable = representation === "object";
  const measureEditMs = writable ? timed(() => core.cells.setValue(activeRow(core), COL.amount, 1)) : null;
  const refreshMs = await timedAsync(async () => {
    if (writable) {
      source.updateCell(idOf(n - 2), "amount", 2);
      await source.flushTransactions();
      await core.refreshFromTransaction();
      return;
    }
    source.setRevision(source.revision + 1);
    await core.refresh();
  });
  const dimensionField = cardinality === "low" ? "country" : "pair";
  const dimensionValue = cardinality === "low" ? "c0" : 0;
  const dimensionEditMs = writable
    ? timed(() => core.cells.setValue(activeRow(core), COL[dimensionField], dimensionValue))
    : null;
  if (writable === false) {
    check(`${label} columnar run materializes no record`, counts.records === 0, `getRecord calls=${counts.records}`);
  }

  core.destroy();
  return {
    sample: {
      treeMs,
      aggregatesMs: constructionMs - treeMs,
      constructionMs,
      locateScanMs,
      locateRecentMs,
      expandOneMs,
      collapseOneMs,
      expandAllMs,
      collapseAllMs,
      toggleWithHeightsMs,
      measureEditMs,
      refreshMs,
      dimensionEditMs,
      flatRetainedBytes,
      groupedRetainedBytes,
      engineRetainedBytes: groupedRetainedBytes - flatRetainedBytes,
    },
    expandedRowCount,
  };
};

const readPositiveInteger = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  throw new Error(`${name} must be a positive integer, got ${raw}.`);
};
const ITERATIONS = readPositiveInteger("BENCH_ITERATIONS", 3);
const WARM_UP_SAMPLES = 1;
const readRowCounts = () => {
  const raw = process.env.BENCH_ROW_COUNTS;
  if (raw === undefined || raw === "") return [100000, 1000000];
  const counts = raw.split(",").map(Number);
  if (counts.every((count) => Number.isInteger(count) && count > 0)) return counts;
  throw new Error(`BENCH_ROW_COUNTS must list positive integers, got ${raw}.`);
};
const ROW_COUNTS = readRowCounts();

const median = (values) => {
  const present = values.filter((value) => value !== null);
  if (present.length === 0) return null;
  const sorted = [...present].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const medianSample = (samples) =>
  Object.fromEntries(Object.keys(samples[0]).map((key) => [key, median(samples.map((sample) => sample[key]))]));

const runCase = async (params) => {
  const label = `n=${params.n} ${params.cardinality} ${params.representation}`;
  try {
    for (let warmUp = 0; warmUp < WARM_UP_SAMPLES; warmUp += 1) await sampleCase(params);
    const runs = [];
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) runs.push(await sampleCase(params));
    const samples = runs.map((run) => run.sample);
    const result = {
      n: params.n,
      cardinality: params.cardinality,
      representation: params.representation,
      groups: CARDINALITIES[params.cardinality].groupsPer(params.n),
      expandedRowCount: runs[0].expandedRowCount,
      median: medianSample(samples),
      rawSamples: samples,
    };
    const m = result.median;
    console.log(
      `  ${label}: tree ${m.treeMs.toFixed(1)} agg ${m.aggregatesMs.toFixed(1)} locate ${m.locateScanMs.toFixed(1)}/${m.locateRecentMs.toFixed(1)} ` +
        `expand ${m.expandOneMs.toFixed(1)} collapse ${m.collapseOneMs.toFixed(1)} all ${m.expandAllMs.toFixed(1)} ms`,
    );
    return result;
  } catch (error) {
    check(`${label} completed`, false, error instanceof Error ? (error.stack ?? error.message) : String(error));
    return null;
  }
};

const flagsOf = (cases) => {
  const atScale = cases.filter((entry) => entry.n === FLAGS.atRows);
  const slowToggle = atScale.filter(
    (entry) => Math.max(entry.median.expandOneMs, entry.median.collapseOneMs, entry.median.toggleWithHeightsMs) > FLAGS.toggleMs,
  );
  const slowAggregates = atScale.filter(
    (entry) => entry.cardinality === "low" && entry.median.aggregatesMs > FLAGS.aggregatesMs,
  );
  const name = (entry) => `${entry.cardinality} ${entry.representation}`;
  return {
    thresholds: FLAGS,
    toggleOver100Ms: slowToggle.map(name),
    aggregatesOver250Ms: slowAggregates.map(name),
  };
};

const run = async () => {
  const warn = console.warn;
  console.warn = () => {};
  const cases = [];
  console.log(`Row grouping smoke (1 warm-up, ${ITERATIONS} samples per case)`);
  for (const n of ROW_COUNTS) {
    const columnar = generateColumns(n);
    for (const cardinality of Object.keys(CARDINALITIES)) {
      for (const representation of ["object", "columnar"]) {
        const result = await runCase({ n, cardinality, representation, columnar });
        if (result !== null) cases.push(result);
      }
    }
  }
  console.warn = warn;

  // Record the actual build profile so a report cannot describe a development build as production.
  const coreEntry = resolve(repoRoot, "packages", "core", "dist", "index.js");
  const buildProfile = existsSync(`${coreEntry}.map`) ? "development" : "production";
  const provenance = {
    ...collectPackageProvenance(["@gp-grid/core"], "candidate"),
    buildProfile,
    entrySourcemapPresent: buildProfile === "development",
  };
  check("core build is production", buildProfile === "production", `buildProfile=${buildProfile}`);
  const runId =
    process.env.BENCH_RUN_ID ?? `prd008-row-grouping-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const outDir = resolve(repoRoot, "benchmarks", "results", "runs", runId);
  const outFile = resolve(outDir, "row-grouping-smoke.json");
  if (existsSync(outFile)) {
    throw new Error(
      `Row grouping smoke output already exists and will not be overwritten: ${outFile}. ` +
        "Use a unique BENCH_RUN_ID or delete the previous result deliberately.",
    );
  }

  const failures = invariants.filter((entry) => entry.pass === false);
  const flags = flagsOf(cases);
  const results = {
    runId,
    generatedAt: new Date().toISOString(),
    scope: "core-only",
    note:
      "Structural invariants are the guarantee; timings and heap deltas are noisy. " +
      "Retained bytes are heapUsed + arrayBuffers after gc. Toggles include the D4 applier " +
      "(anchor and active-cell locate on the last flat record). locateScanMs locates a record id " +
      "not read before (a scan of the flat rows); locateRecentMs one just read. aggregatesMs is the grouping " +
      "with both measures minus the grouping with none.",
    provenance,
    environment: {
      os: `${os.platform()} ${os.release()}`,
      node: process.version,
      cpuModel: os.cpus().at(0)?.model ?? "unknown",
      logicalCpuCount: os.cpus().length,
      totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
    },
    workload: {
      rowCounts: ROW_COUNTS,
      cardinalities: Object.fromEntries(
        Object.entries(CARDINALITIES).map(([key, value]) => [key, value.dimensions.map((d) => d.field)]),
      ),
      measures: MEASURES,
      representations: ["object rows (mutable client source)", "columnar (typed and ordinary arrays)"],
      rowHeightPx: ROW_HEIGHT,
      viewport: VIEWPORT,
      heightOverrides: HEIGHT_OVERRIDES,
      performance: { warmUpSamplesDiscarded: WARM_UP_SAMPLES, iterations: ITERATIONS, statistic: "median" },
    },
    flags,
    failedInvariants: failures,
    invariants,
    cases,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`Flags: toggle > ${FLAGS.toggleMs} ms: [${flags.toggleOver100Ms}]; aggregates > ${FLAGS.aggregatesMs} ms: [${flags.aggregatesOver250Ms}]`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} row grouping smoke invariant(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${invariants.length} row grouping smoke invariants passed.`);
  }
  console.log("Written to " + outFile);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
