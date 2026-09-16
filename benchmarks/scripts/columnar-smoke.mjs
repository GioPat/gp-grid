// benchmarks/scripts/columnar-smoke.mjs
//
// Deterministic Node-level evidence for plan 001a: source construction and
// grid binding are independent of row count, and no cell value is read before
// rendering or explicit processing. Structural counters are primary; timings
// and heap deltas are secondary and documented as noisy.
//
// Usage: node --expose-gc benchmarks/scripts/columnar-smoke.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GridCore,
  createClientDataSource,
  createColumnarDataSource,
} from "../../packages/core/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const COLUMN_NAMES = ["id", "name", "email", "score", "active", "group"];

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

/** Every field is an instrumented accessor, so any cell read is observable. */
const instrumentedSource = (rowCount, backing) => {
  let reads = 0;
  const fields = Object.entries(backing).map(([field, data]) => ({
    field,
    getValue: (sourceRow) => {
      reads += 1;
      return data[sourceRow];
    },
  }));
  const source = createColumnarDataSource({
    rowCount,
    fields,
    getRowId: (sourceRow) => sourceRow,
  });
  return { source, reads: () => reads };
};

const run = async () => {
  const rowCounts = [100000, 1000000];
  const results = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    columnCount: COLUMN_NAMES.length,
    note: "Structural counters are the guarantee; timings/heap are noisy.",
    deterministic: {},
    cases: [],
  };

  for (const n of rowCounts) {
    const backing = generateColumns(n);
    const { source, reads } = instrumentedSource(n, backing);
    const readsAfterConstruction = reads();
    const bufferBefore = backing.score.buffer;

    const core = new GridCore({ columns, dataSource: source, rowHeight: 32, overscan: 3 });
    await core.initialize();
    const readsAfterRender = reads();
    core.setViewport(0, 0, 1200, 640);
    const readsAfterFirstWindow = reads();
    core.setViewport(0, 0, 1200, 3200);
    core.setViewport(0, 0, 1200, 640);
    const readsAfterScroll = reads();

    core.setCellValue(0, 3, 999);
    const sourceUnchanged = source.access.getValue(0, "score") === (0 * 7919) % 1000;
    core.startEdit(0, 3);
    const editRejected = core.getEditState() === null;

    core.destroy();
    const bufferPreserved = backing.score.buffer === bufferBefore && backing.score.length === n;
    const usableAfterTeardown = backing.score[1] === (1 * 7919) % 1000;

    results.deterministic["n" + n] = {
      sourceConstructionCellReads: readsAfterConstruction,
      bindAndInitialRenderCellReads: readsAfterRender,
      firstWindowCellReads: readsAfterFirstWindow - readsAfterRender,
      scrollCellReads: readsAfterScroll - readsAfterFirstWindow,
      typedArrayBufferPreserved: bufferPreserved,
      usableAfterTeardown,
      sourceUnchangedAfterRejectedWrite: sourceUnchanged,
      editRejectedOnReadOnlySource: editRejected,
      totalRows: n,
    };
    gc();
  }

  // Bounded performance smoke. Each representation is generated directly from
  // the same schedule; the object representation is released before the
  // columnar one is generated so they are not both resident.
  for (const n of rowCounts) {
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
      rowHeight: 32,
    });
    await objectCore.initialize();
    const objectInitMs = now() - initStart;
    const afterInit = heapUsed();
    objectCore.destroy();
    results.cases.push({
      n,
      object: {
        buildMs: objectBuildMs,
        initMs: objectInitMs,
        datasetHeapBytes: afterBuild - base,
        bindingHeapBytes: afterInit - afterBuild,
      },
    });
    // Release object rows before generating the columnar representation.
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
      rowHeight: 32,
    });
    await columnCore.initialize();
    const columnInitMs = now() - columnInitStart;
    const columnAfterInit = heapUsed();
    columnCore.destroy();

    results.cases.at(-1).columnar = {
      buildMs: columnBuildMs,
      initMs: columnInitMs,
      datasetHeapBytes: columnAfterBuild - columnBase,
      bindingHeapBytes: columnAfterInit - columnAfterBuild,
    };
    gc();
  }

  const outDir = resolve(
    repoRoot,
    "benchmarks",
    "results",
    "runs",
    "prd001a-columnar-smoke",
  );
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, "columnar-smoke.json");
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  console.log("\nWritten to " + outFile);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
