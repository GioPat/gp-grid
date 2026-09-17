// benchmarks/scripts/columnar-smoke.mjs
//
// Deterministic core-only evidence for plan 001a: source construction and
// grid binding are independent of row count, and no cell value is read before
// rendering or explicit processing. Structural counters are primary; timings
// and heap deltas are secondary and documented as noisy.
//
// Scope: this node harness exercises GridCore only. Framework-rendered cell
// reads and browser scrolling are asserted separately by the conformance
// fixtures (`pnpm test:conformance`); a core-only zero-read result does not
// prove a rendered-cell bound.
//
// A violated invariant exits nonzero. Repeated runs use a unique run ID (or
// BENCH_RUN_ID) and refuse to overwrite an existing result path.
//
// Usage:
//   pnpm --filter @gp-grid/core build
//   node --expose-gc benchmarks/scripts/columnar-smoke.mjs
//   BENCH_RUN_ID=my-run node --expose-gc benchmarks/scripts/columnar-smoke.mjs

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GridCore,
  createClientDataSource,
  createColumnarDataSource,
} from "../../packages/core/dist/index.js";
import { collectPackageProvenance } from "./artifact-resolution.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const COLUMN_NAMES = ["id", "name", "email", "score", "active", "group"];
const SCORE_COLUMN_INDEX = 3;
const ROW_HEIGHT = 32;
const OVERSCAN = 3;
const VIEWPORT = { width: 1200, height: 640 };
const SCROLL_TOP = 3200;

const columns = COLUMN_NAMES.map((field, index) => ({
  field,
  cellDataType:
    index === 0 || index === 3
      ? "number"
      : field === "active"
        ? "boolean"
        : "text",
  width: 120,
}));

const now = () => Number(process.hrtime.bigint()) / 1e6;

const generateObjectRows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i,
    name: "name-" + (i % 997),
    email: "user" + i + "@example.com",
    score: (i * 7919) % 1000,
    active: i % 2 === 0,
    group: "g" + (i % 13),
  }));

const generateColumns = (n) => {
  const id = new Int32Array(n);
  const name = new Array(n);
  const email = new Array(n);
  const score = new Float64Array(n);
  const active = new Uint8Array(n);
  const group = new Array(n);
  for (let i = 0; i < n; i += 1) {
    id[i] = i;
    name[i] = "name-" + (i % 997);
    email[i] = "user" + i + "@example.com";
    score[i] = (i * 7919) % 1000;
    active[i] = i % 2;
    group[i] = "g" + (i % 13);
  }
  return { id, name, email, score, active, group };
};

const heapUsed = () => process.memoryUsage().heapUsed;
const gc = () => {
  if (typeof globalThis.gc === "function") globalThis.gc();
};

/**
 * Every field is an instrumented accessor, so any cell read is observable and
 * the source positions read are recorded. getRecord is wrapped to count
 * implicit record materialization.
 */
const instrumentedSource = (rowCount, backing) => {
  let reads = 0;
  const readRows = [];
  const fields = COLUMN_NAMES.map((field) => ({
    field,
    getValue: (sourceRow) => {
      reads += 1;
      readRows.push(sourceRow);
      return backing[field][sourceRow];
    },
  }));
  const source = createColumnarDataSource({
    rowCount,
    fields,
    getRowId: (sourceRow) => sourceRow,
  });

  let materializations = 0;
  const readRecord = source.getRecord.bind(source);
  source.getRecord = (sourceRow) => {
    materializations += 1;
    return readRecord(sourceRow);
  };

  return {
    source,
    reads: () => reads,
    readRows: () => [...readRows],
    resetReads: () => {
      reads = 0;
      readRows.length = 0;
    },
    materializations: () => materializations,
  };
};

const invariants = [];
const check = (name, pass, detail) => {
  const entry = { name, pass: Boolean(pass), detail: String(detail ?? "") };
  invariants.push(entry);
  console.log(`  ${entry.pass ? "ok  " : "FAIL"} ${name}`);
  if (entry.pass === false) console.error(`       ${entry.detail}`);
};

const runCase = async (name, work) => {
  try {
    return await work();
  } catch (error) {
    check(`${name} completed`, false, error instanceof Error ? error.stack ?? error.message : String(error));
    return null;
  }
};

const deterministicCase = async (n) => {
  const backing = generateColumns(n);
  const store = instrumentedSource(n, backing);
  const bufferBefore = backing.score.buffer;

  const readsAfterConstruction = store.reads();
  check(`n=${n} construction reads no cells`, readsAfterConstruction === 0, `reads=${readsAfterConstruction}`);

  const core = new GridCore({
    columns,
    dataSource: store.source,
    rowHeight: ROW_HEIGHT,
    overscan: OVERSCAN,
  });
  await core.initialize();
  const readsAfterBind = store.reads();
  check(`n=${n} bind and initial render read no cells`, readsAfterBind === 0, `reads=${readsAfterBind}`);

  core.setViewport(0, 0, VIEWPORT.width, VIEWPORT.height);
  const firstRange = core.getVisibleRowRange();
  const readsAfterWindow = store.reads();
  check(`n=${n} first window reads no cells`, readsAfterWindow === 0, `reads=${readsAfterWindow}`);
  check(`n=${n} first window starts at row 0`, firstRange.start === 0, JSON.stringify(firstRange));

  // Resize-only case: the scroll offset is unchanged, only the viewport height
  // changes. Kept separate from the real scroll case below.
  core.setViewport(0, 0, VIEWPORT.width, 320);
  const resizeRange = core.getVisibleRowRange();
  const readsAfterResize = store.reads();
  check(`n=${n} resize-only reads no cells`, readsAfterResize === 0, `reads=${readsAfterResize}`);
  check(
    `n=${n} resize-only changes the displayed range`,
    resizeRange.end !== firstRange.end || resizeRange.start !== firstRange.start,
    `first=${JSON.stringify(firstRange)} resize=${JSON.stringify(resizeRange)}`,
  );

  // Real scroll case: fixed viewport dimensions, changed scroll offset.
  core.setViewport(SCROLL_TOP, 0, VIEWPORT.width, VIEWPORT.height);
  const scrollRange = core.getVisibleRowRange();
  const readsAfterScroll = store.reads();
  // Scroll virtualization compresses the DOM scroll space at large row counts,
  // so the row mapped from a given offset is not simply scrollTop / rowHeight.
  // The invariant is that the displayed range advances with the scroll offset.
  check(`n=${n} scroll reads no cells`, readsAfterScroll === 0, `reads=${readsAfterScroll}`);
  check(
    `n=${n} scroll changes the displayed range`,
    scrollRange.start > firstRange.start,
    `first=${JSON.stringify(firstRange)} scroll=${JSON.stringify(scrollRange)}`,
  );
  check(
    `n=${n} scrolled range stays in bounds`,
    scrollRange.end >= scrollRange.start && scrollRange.end < n,
    JSON.stringify(scrollRange),
  );

  // Requested values/read bounds for the displayed window: reading the window
  // reads exactly the source rows in it.
  store.resetReads();
  const values = [];
  const expectedValues = [];
  for (let row = scrollRange.start; row <= scrollRange.end; row += 1) {
    values.push(core.getCellValue(row, SCORE_COLUMN_INDEX));
    expectedValues.push(backing.score[row]);
  }
  const readRows = store.readRows();
  check(
    `n=${n} displayed window values match the source`,
    values.every((value, index) => value === expectedValues[index]),
    `first=${values[0]} expected=${expectedValues[0]}`,
  );
  check(
    `n=${n} window reads stay within the requested bounds`,
    readRows.every((row) => row >= scrollRange.start && row <= scrollRange.end),
    readRows.length === 0 ? "no reads" : `min=${Math.min(...readRows)} max=${Math.max(...readRows)}`,
  );
  check(
    `n=${n} window reads are one per requested cell`,
    readRows.length === scrollRange.end - scrollRange.start + 1,
    `reads=${readRows.length}`,
  );

  // Same-array revision refresh revalidates metadata without scanning cells.
  store.resetReads();
  store.source.setRevision(store.source.revision + 1);
  await core.refresh();
  const readsAfterRefresh = store.reads();
  check(`n=${n} same-array revision refresh reads no cells`, readsAfterRefresh === 0, `reads=${readsAfterRefresh}`);

  // Read-only write rejection leaves the borrowed value untouched.
  core.setCellValue(0, SCORE_COLUMN_INDEX, 999);
  const sourceUnchanged = store.source.access.getValue(0, "score") === (0 * 7919) % 1000;
  core.startEdit(0, SCORE_COLUMN_INDEX);
  const editRejected = core.getEditState() === null;
  check(`n=${n} rejected write leaves the source unchanged`, sourceUnchanged, "borrowed score changed");
  check(`n=${n} edit rejected on a read-only source`, editRejected, "edit state opened");
  check(`n=${n} no implicit record materialization`, store.materializations() === 0, `calls=${store.materializations()}`);

  core.destroy();
  const bufferPreserved = backing.score.buffer === bufferBefore && backing.score.length === n;
  const usableAfterTeardown = backing.score[1] === (1 * 7919) % 1000;
  check(`n=${n} typed-array buffer preserved`, bufferPreserved, "buffer identity or length changed");
  check(`n=${n} backing array usable after teardown`, usableAfterTeardown, "value changed after teardown");

  return {
    rowCount: n,
    scope: "core-only",
    reads: {
      construction: readsAfterConstruction,
      bindAndInitialRender: readsAfterBind,
      firstWindow: readsAfterWindow,
      resizeOnly: readsAfterResize,
      scroll: readsAfterScroll,
      revisionRefresh: readsAfterRefresh,
    },
    ranges: { first: firstRange, resizeOnly: resizeRange, scroll: scrollRange },
    windowReadBounds: { start: scrollRange.start, end: scrollRange.end, count: readRows.length },
    typedArrayBufferPreserved: bufferPreserved,
    backingUsableAfterTeardown: usableAfterTeardown,
    sourceUnchangedAfterRejectedWrite: sourceUnchanged,
    editRejectedOnReadOnlySource: editRejected,
    recordMaterializations: store.materializations(),
  };
};

const performanceCases = [];
const runPerformanceCase = async (n) => {
  gc();
  const base = heapUsed();
  const buildStart = now();
  const rows = generateObjectRows(n);
  const objectBuildMs = now() - buildStart;
  const afterBuild = heapUsed();
  const initStart = now();
  const objectCore = new GridCore({
    columns,
    dataSource: createClientDataSource(rows),
    rowHeight: ROW_HEIGHT,
  });
  await objectCore.initialize();
  const objectInitMs = now() - initStart;
  const afterInit = heapUsed();
  objectCore.destroy();
  const objectSample = {
    buildMs: objectBuildMs,
    initMs: objectInitMs,
    datasetHeapBytes: afterBuild - base,
    bindingHeapBytes: afterInit - afterBuild,
  };
  // Release the object representation before generating the columnar one.
  rows.length = 0;
  gc();

  const columnBase = heapUsed();
  const columnBuildStart = now();
  const data = generateColumns(n);
  const columnBuildMs = now() - columnBuildStart;
  const columnAfterBuild = heapUsed();
  const columnInitStart = now();
  const columnSource = createColumnarDataSource({
    rowCount: n,
    fields: COLUMN_NAMES.map((field) => ({ field, data: data[field] })),
  });
  const columnCore = new GridCore({
    columns,
    dataSource: columnSource,
    rowHeight: ROW_HEIGHT,
  });
  await columnCore.initialize();
  const columnInitMs = now() - columnInitStart;
  const columnAfterInit = heapUsed();
  columnCore.destroy();
  const columnarSample = {
    buildMs: columnBuildMs,
    initMs: columnInitMs,
    datasetHeapBytes: columnAfterBuild - columnBase,
    bindingHeapBytes: columnAfterInit - columnAfterBuild,
  };
  gc();

  performanceCases.push({
    n,
    scope: "core-only",
    representation: "object-vs-columnar",
    note: "Single noisy sample; the repeated three-sample performance gate remains open.",
    rawSamples: [{ object: objectSample, columnar: columnarSample }],
    object: objectSample,
    columnar: columnarSample,
  });
};

const run = async () => {
  const rowCounts = [100000, 1000000];
  const deterministic = [];

  console.log("Deterministic core-only checks");
  for (const n of rowCounts) {
    const result = await runCase(`n=${n} deterministic`, () => deterministicCase(n));
    if (result !== null) deterministic.push(result);
  }

  console.log("Bounded performance smoke");
  for (const n of rowCounts) {
    await runCase(`n=${n} performance`, () => runPerformanceCase(n));
  }

  // The smoke imports whatever is in `packages/core/dist`. A dev build emits a
  // sourcemap next to the entry; a production build does not. Record the actual
  // profile so a report cannot describe a development build as production.
  const coreEntry = resolve(repoRoot, "packages", "core", "dist", "index.js");
  const buildProfile = existsSync(`${coreEntry}.map`) ? "development" : "production";
  const provenance = {
    ...collectPackageProvenance(["@gp-grid/core"], "candidate"),
    buildProfile,
    entrySourcemapPresent: buildProfile === "development",
  };
  const runId =
    process.env.BENCH_RUN_ID ??
    `prd001a-columnar-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const outDir = resolve(repoRoot, "benchmarks", "results", "runs", runId);
  const outFile = resolve(outDir, "columnar-smoke.json");

  if (existsSync(outFile)) {
    throw new Error(
      `Columnar smoke output already exists and will not be overwritten: ${outFile}. ` +
        "Use a unique BENCH_RUN_ID or delete the previous result deliberately.",
    );
  }

  const failures = invariants.filter((entry) => entry.pass === false);
  const results = {
    runId,
    representation: "columnar",
    generatedAt: new Date().toISOString(),
    scope: "core-only",
    note:
      "Structural counters are the guarantee; timings and heap deltas are noisy. " +
      "Framework-rendered cell reads and browser scrolling are asserted separately by pnpm test:conformance.",
    provenance,
    environment: {
      os: `${os.platform()} ${os.release()}`,
      node: process.version,
      cpuModel: os.cpus().at(0)?.model ?? "unknown",
      logicalCpuCount: os.cpus().length,
      totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
    },
    workload: {
      rowCounts,
      columnCount: COLUMN_NAMES.length,
      rowHeightPx: ROW_HEIGHT,
      viewport: VIEWPORT,
      overscan: OVERSCAN,
      scrollTopPx: SCROLL_TOP,
      representations: ["object rows", "borrowed ordinary/typed-array columns"],
      scopes: {
        coreOnly: [
          "construction",
          "bind",
          "render-sync",
          "resize-only",
          "scroll",
          "revision-refresh",
          "write-rejection",
        ],
        frameworkRenderedReads: "asserted separately by pnpm test:conformance",
      },
    },
    failedInvariants: failures,
    invariants,
    deterministic,
    cases: performanceCases,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(results, null, 2));

  if (failures.length > 0) {
    console.error(`\n${failures.length} columnar smoke invariant(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${invariants.length} columnar smoke invariants passed.`);
  }
  console.log("Written to " + outFile);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
