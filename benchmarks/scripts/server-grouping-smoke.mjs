// benchmarks/scripts/server-grouping-smoke.mjs
//
// Core-only evidence for PRD 009 (AC-009-04, AC-009-01): a server grouping view
// over an in-memory ServerGroupingService of 1,000,000 generated leaves. Reported:
// root load, expanding a 100,000-leaf group, a scroll of 50 windows through it,
// expand all, collapse, and retained memory against the flat grid of the same
// viewport. Workloads: low cardinality (two dimensions, 20 x 50 groups), high
// cardinality (one dimension, 100,000 root groups) and a two-dimension variant
// whose first group holds 100,000 leaves; `sum` and `avg` measures and a top
// total row in each.
//
// Structural invariants exit nonzero: the root load sends one children request
// and no leaf request; expanding the 100,000-leaf group sends one leaf request
// and retains under 64 bytes per placeholder; after every scroll window the
// loaded pages stay within max(maxPages, required pages of the current ranges);
// the service never sees more than maxConcurrentRequests in flight; a collapse
// drops every page of its branch; no leaf request names a path shorter than the
// dimensions. Timings and heap deltas are secondary and noisy. Retained memory
// counts `heapUsed + arrayBuffers` after gc.
//
// The service resolves every response in a later task (a resolved promise, then
// setTimeout(0)) and settles an aborted request at once, as a fetch would, so
// its in-flight count is what the loader keeps open. Two grids per sample of the
// 100,000-leaf workload: a request-log grid without prefetch (root load, expand,
// heap, request counts) and a scroll grid on the balanced preset's prefetch
// (scroll, page and concurrency budgets, collapse).
//
// Usage:
//   pnpm test:server-groups
//   BENCH_RUN_ID=my-run BENCH_ITERATIONS=5 node --expose-gc benchmarks/scripts/server-grouping-smoke.mjs
//
// Samples: one discarded warm-up, then BENCH_ITERATIONS (default 3) measured
// samples per workload; the median and the raw samples are kept.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GridCore,
  createServerDataSource,
  createServerGroupingSource,
  decodeGroupId,
  encodeGroupId,
} from "../../packages/core/dist/index.js";
import { collectPackageProvenance } from "./artifact-resolution.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const LEAF_COUNT = 1000000;
const BIG_GROUP = 100000;
const ROW_HEIGHT = 32;
const VISIBLE_ROWS = 30;
// The header row is `rowHeight` tall by default and sits inside the viewport height.
const VIEWPORT = { width: 1200, height: ROW_HEIGHT * (VISIBLE_ROWS + 1) };
// The scroll grid keeps the balanced preset's one-page prefetch, which keeps the
// loader's concurrency bound busy. The request-log grid prefetches nothing, since a
// neighbour page would add a leaf request to the expand and a root page to the
// 100,000-group root load.
const CACHE = { pageSize: 100, maxPages: 20 };
const EXACT_CACHE = { ...CACHE, prefetchPages: 0 };
const MAX_CONCURRENT_REQUESTS = 4;
const SCROLL_WINDOWS = 50;
const PLACEHOLDER_BYTES_LIMIT = 64;
const SETTLE_LIMIT_MS = 10000;
const REVISION = 1;
const MEASURES = [
  { field: "amount", aggregate: "sum" },
  { field: "score", aggregate: "avg" },
];
const NUMERIC_FIELDS = new Set(["id", "pair", "amount", "score"]);

const pad = (value) => String(value).padStart(2, "0");
const amountOf = (i) => (i * 7919) % 1000;
const scoreOf = (i) => (i * 104729) % 100;
const regionOf = (i) => (i < BIG_GROUP ? "r00" : "r" + pad(1 + Math.floor((i - BIG_GROUP) / 50000)));
const bucketOf = (i) => (i < BIG_GROUP ? "b00" : "b" + pad(Math.floor((i - BIG_GROUP) / 1000) % 50));

const WORKLOADS = [
  {
    name: "low",
    description: "two dimensions, 20 x 50 groups of 1,000 leaves",
    dimensions: ["country", "city"],
    keyOf: [(i) => "c" + pad(i % 20), (i) => "city" + pad(Math.floor(i / 20) % 50)],
    run: "expandAll",
  },
  {
    name: "high",
    description: "one dimension, 100,000 root groups of 10 leaves",
    dimensions: ["pair"],
    keyOf: [(i) => Math.floor(i / 10)],
    run: "expandAll",
  },
  {
    name: "high-deep",
    description: "two dimensions; the first group r00 holds one group b00 of 100,000 leaves",
    dimensions: ["region", "bucket"],
    keyOf: [regionOf, bucketOf],
    run: "bigGroup",
  },
];
const BIG_PATH = [
  ["region", "s", "r00"],
  ["bucket", "s", "b00"],
];

const now = () => Number(process.hrtime.bigint()) / 1e6;
const immediate = () => new Promise((resolve) => setImmediate(resolve));
const gc = () => {
  if (typeof globalThis.gc === "function") globalThis.gc();
};
const retained = () => {
  gc();
  gc();
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.arrayBuffers;
};

const invariants = [];
const check = (name, pass, detail) => {
  const entry = { name, pass: Boolean(pass), detail: String(detail ?? "") };
  invariants.push(entry);
  if (entry.pass === false) console.error(`  FAIL ${name}\n       ${entry.detail}`);
};

// ---------------------------------------------------------------------------
// Service: the mock's semantics (grouping by path, key order, exact counts,
// sum/avg, totals at the root, paging by range) over an index built in one pass.
// ---------------------------------------------------------------------------

const ROOT_KEY = "";
const tagOf = (key) => (typeof key === "number" ? "n" : "s");
const stepKey = (tag, key) => `|${tag}:${key}`;
const pathKeyOf = (path) => path.map(([, tag, key]) => stepKey(tag, key)).join("");

const compareKeys = (a, b) => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
};

const createGroup = (groups, pathKey, parentKey, key) => {
  const group = { parentKey, key, leafCount: 0, amount: 0, score: 0, ordinal: -1, node: null };
  groups.set(pathKey, group);
  return group;
};

/** Adds leaf `i` to every group on its path; returns its terminal path key. */
const addLeaf = (groups, keyOf, i) => {
  const amount = amountOf(i);
  const score = scoreOf(i);
  let parentKey = ROOT_KEY;
  for (const read of keyOf) {
    const key = read(i);
    const pathKey = parentKey + stepKey(tagOf(key), key);
    const group = groups.get(pathKey) ?? createGroup(groups, pathKey, parentKey, key);
    group.leafCount += 1;
    group.amount += amount;
    group.score += score;
    parentKey = pathKey;
  }
  return parentKey;
};

const nodeOf = (group, childCount) => ({
  key: group.key,
  childCount,
  leafCount: group.leafCount,
  aggregates: { amount: group.amount, score: group.score / group.leafCount },
});

/** Sorted child groups per parent path key, with each group's ordinal and node. */
const childrenIndex = (groups, leaves) => {
  const children = new Map([[ROOT_KEY, []]]);
  for (const group of groups.values()) {
    const siblings = children.get(group.parentKey) ?? [];
    siblings.push(group);
    children.set(group.parentKey, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((a, b) => compareKeys(a.key, b.key));
    for (const [ordinal, group] of siblings.entries()) group.ordinal = ordinal;
  }
  for (const [pathKey, group] of groups) {
    group.node = nodeOf(group, children.get(pathKey)?.length ?? leaves.get(pathKey).length);
  }
  return children;
};

const indexLeaves = ({ keyOf }) => {
  const groups = new Map();
  const leaves = new Map();
  const leafOrdinal = new Int32Array(LEAF_COUNT);
  let amount = 0;
  let score = 0;
  for (let i = 0; i < LEAF_COUNT; i += 1) {
    const terminal = addLeaf(groups, keyOf, i);
    const list = leaves.get(terminal) ?? [];
    if (list.length === 0) leaves.set(terminal, list);
    leafOrdinal[i] = list.length;
    list.push(i);
    amount += amountOf(i);
    score += scoreOf(i);
  }
  const children = childrenIndex(groups, leaves);
  return { groups, leaves, children, leafOrdinal, totals: { amount, score: score / LEAF_COUNT } };
};

const createService = (workload) => {
  const { dimensions, keyOf } = workload;
  const index = indexLeaves(workload);
  const stats = { children: 0, leaves: 0, shortLeafPaths: 0, inFlight: 0, peakInFlight: 0, phasePeakInFlight: 0 };

  const recordOf = (i) => {
    const record = { id: i, amount: amountOf(i), score: scoreOf(i) };
    for (const [level, field] of dimensions.entries()) record[field] = keyOf[level](i);
    return record;
  };

  const respond = (signal, build) => {
    stats.inFlight += 1;
    stats.peakInFlight = Math.max(stats.peakInFlight, stats.inFlight);
    stats.phasePeakInFlight = Math.max(stats.phasePeakInFlight, stats.inFlight);
    return new Promise((resolvePage, reject) => {
      let open = true;
      const finish = (settle) => {
        if (open) {
          open = false;
          stats.inFlight -= 1;
          signal?.removeEventListener("abort", onAbort);
          settle();
        }
      };
      const onAbort = () => finish(() => reject(new Error("aborted")));
      const answer = () => {
        try {
          resolvePage(build());
        } catch (error) {
          reject(error);
        }
      };
      signal?.addEventListener("abort", onAbort);
      void Promise.resolve().then(() => setTimeout(() => finish(answer), 0));
    });
  };

  const fetchChildren = (request) => {
    stats.children += 1;
    return respond(request.signal, () => {
      const siblings = index.children.get(pathKeyOf(request.path));
      if (siblings === undefined) throw new RangeError(`No groups under ${pathKeyOf(request.path)}`);
      const { startRow, endRow } = request.range;
      const response = {
        revision: REVISION,
        totalCount: siblings.length,
        children: siblings.slice(startRow, endRow).map((group) => group.node),
      };
      if (request.path.length === 0) response.totals = index.totals;
      return response;
    });
  };

  const fetchLeaves = (request) => {
    stats.leaves += 1;
    if (request.path.length < dimensions.length) stats.shortLeafPaths += 1;
    return respond(request.signal, () => {
      const list = index.leaves.get(pathKeyOf(request.path));
      if (list === undefined) throw new RangeError(`No leaves under ${pathKeyOf(request.path)}`);
      const { startRow, endRow } = request.range;
      return { revision: REVISION, totalCount: list.length, rows: list.slice(startRow, endRow).map(recordOf) };
    });
  };

  const leafPath = (i) =>
    dimensions.map((field, level) => {
      const key = keyOf[level](i);
      return [field, tagOf(key), key];
    });

  return {
    fetchChildren,
    fetchLeaves,
    stats,
    recordOf,
    reset: () =>
      Object.assign(stats, { children: 0, leaves: 0, shortLeafPaths: 0, inFlight: 0, peakInFlight: 0, phasePeakInFlight: 0 }),
    startPhase: () => {
      stats.phasePeakInFlight = stats.inFlight;
    },
    groupCount: index.groups.size,
    groupOrdinal: (path) => index.groups.get(pathKeyOf(path)).ordinal,
    leafPosition: (i) => ({ parentId: encodeGroupId(leafPath(i)), ordinal: index.leafOrdinal[i] }),
  };
};

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

const columnsOf = (workload) =>
  ["id", ...workload.dimensions, "amount", "score"].map((field) => ({
    field,
    cellDataType: NUMERIC_FIELDS.has(field) ? "number" : "text",
    width: 120,
  }));

/** Captures the view of the query, its start time and the ranges core last asked it to load. */
const instrument = (source) => {
  const probe = { access: null, queryStart: 0, dataLoadedAt: 0, ranges: [] };
  const query = source.query;
  source.query = async (request) => {
    probe.queryStart = now();
    const response = await query(request);
    const access = response.access;
    const requestRows = access.requestRows;
    access.requestRows = (ranges) => {
      probe.ranges = ranges.map((range) => ({ ...range }));
      requestRows(ranges);
    };
    probe.access = access;
    return response;
  };
  return probe;
};

/** Resolves with the time of the next `"rows"` change, after core applied it. */
const watchRows = (view) => {
  let waiting = null;
  view.subscribe((change) => {
    if (change.kind === "rows" && waiting !== null) {
      const resolveRows = waiting;
      waiting = null;
      resolveRows(now());
    }
  });
  return () => {
    let timer;
    const limit = new Promise((resolveLimit) => {
      timer = setTimeout(() => resolveLimit(Number.NaN), SETTLE_LIMIT_MS);
    });
    const next = new Promise((resolveRows) => {
      waiting = resolveRows;
    });
    return Promise.race([next, limit]).finally(() => clearTimeout(timer));
  };
};

const placeholdersMounted = (core) => {
  const { start, end } = core.geometry.getRowWindow();
  const last = Math.min(end, core.rows.getCount());
  let count = 0;
  for (let row = Math.max(start, 0); row < last; row += 1) {
    if (core.rows.has(row) === false) count += 1;
  }
  return count;
};

/** Waits until no placeholder is mounted or, with a view, its loader is idle. */
const settle = async (core, view) => {
  const deadline = now() + SETTLE_LIMIT_MS;
  while (now() < deadline) {
    await immediate();
    if (placeholdersMounted(core) === 0 || view?.diagnostics().inFlight === 0) return true;
  }
  return false;
};

const mountGrouped = async (service, workload, cache) => {
  const source = createServerGroupingSource(service, {
    dimensions: workload.dimensions.map((field) => ({ field })),
    measures: MEASURES,
    getRowId: (row) => row.id,
    grandTotal: "top",
    cache,
    maxConcurrentRequests: MAX_CONCURRENT_REQUESTS,
  });
  const probe = instrument(source);
  const core = new GridCore({ columns: columnsOf(workload), dataSource: source, rowHeight: ROW_HEIGHT });
  core.onBatchInstruction((batch) => {
    if (probe.dataLoadedAt === 0 && batch.some((instruction) => instruction.type === "DATA_LOADED")) {
      probe.dataLoadedAt = now();
    }
  });
  core.setViewport(0, 0, VIEWPORT.width, VIEWPORT.height);
  await core.initialize();
  const view = probe.access;
  const nextRows = watchRows(view);
  const settled = await settle(core, view);
  return { source, core, view, probe, nextRows, settled, rootLoadMs: probe.dataLoadedAt - probe.queryStart };
};

const unmount = ({ core, source }) => {
  core.destroy();
  source.destroy();
};

const pageOf = (ordinal) => Math.floor(ordinal / CACHE.pageSize);

/** The branch page of a view row, keyed by the branch's group id, as the loader names it. */
const pageKeyOf = (view, service, index) => {
  const row = view.getRow(index);
  if (row?.kind === "total") return undefined;
  const id = view.getRowId(index);
  if (row === undefined) {
    const [, ordinal, parentId] = /^gp-pending:(\d+)@(.*)$/.exec(id);
    return `${parentId}#${pageOf(Number(ordinal))}`;
  }
  if (row.kind === "group") {
    const path = decodeGroupId(id);
    return `${encodeGroupId(path.slice(0, -1))}#${pageOf(service.groupOrdinal(path))}`;
  }
  const leaf = service.leafPosition(id);
  return `${leaf.parentId}#${pageOf(leaf.ordinal)}`;
};

const addRangePages = (view, service, range, pages) => {
  for (let index = range.start; index < Math.min(range.end, view.rowCount); index += 1) {
    const key = pageKeyOf(view, service, index);
    if (key !== undefined) pages.add(key);
  }
};

/** Every page with an ordinal in the ranges core last requested: the loader's required set. */
const requiredPages = (view, service, ranges) => {
  const pages = new Set();
  for (const range of ranges) addRangePages(view, service, range, pages);
  return pages.size;
};

const loadedWithinBudget = (grid, service) => {
  const loaded = grid.view.diagnostics().loadedPages;
  const required = requiredPages(grid.view, service, grid.probe.ranges);
  return { loaded, required, within: loaded <= Math.max(CACHE.maxPages, required) };
};

const checkRootLoad = (label, grid, service) => {
  const { children, leaves } = service.stats;
  check(`${label} root load settles`, grid.settled, "settle limit reached");
  check(`${label} root load sends one children request and no leaf request`, children === 1 && leaves === 0, `children=${children} leaves=${leaves}`);
};

const checkService = (label, service) => {
  const { peakInFlight, shortLeafPaths } = service.stats;
  check(`${label} service never has more than ${MAX_CONCURRENT_REQUESTS} requests in flight`, peakInFlight <= MAX_CONCURRENT_REQUESTS, `peak=${peakInFlight}`);
  check(`${label} no leaf request for a path shorter than the dimensions`, shortLeafPaths === 0, `requests=${shortLeafPaths}`);
};

const setExpanded = (label, core, ids, expanded) => {
  const result = core.rowGroups.setExpanded(ids, expanded);
  check(`${label} setExpanded(${expanded}) applies`, result.status === "applied", JSON.stringify(result));
};

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

const sampleExpandAll = async (service, workload) => {
  const label = workload.name;
  service.reset();
  const grid = await mountGrouped(service, workload, EXACT_CACHE);
  checkRootLoad(label, grid, service);
  const rootRows = grid.core.rows.getCount();
  service.startPhase();

  const firstRows = grid.nextRows();
  const start = now();
  setExpanded(label, grid.core, null, true);
  const expandAllMs = now() - start;
  const expandAllFirstRowsMs = (await firstRows) - start;
  check(`${label} expand all applies a rows change`, Number.isFinite(expandAllFirstRowsMs), "no rows change within the limit");
  const settled = await settle(grid.core, grid.view);
  const budget = loadedWithinBudget(grid, service);
  check(`${label} expand all settles with no placeholder mounted`, settled && placeholdersMounted(grid.core) === 0, `settled=${settled}`);
  check(`${label} expand all keeps the page budget`, budget.within, JSON.stringify(budget));
  const sample = {
    rootLoadMs: grid.rootLoadMs,
    expandAllMs,
    expandAllFirstRowsMs,
    expandAllPeakInFlight: service.stats.phasePeakInFlight,
    expandAllLeafRequests: service.stats.leaves,
    loadedPagesAfterExpandAll: budget.loaded,
  };
  const rows = { rootRows, expandedRows: grid.core.rows.getCount() };
  unmount(grid);
  checkService(label, service);
  return { sample, rows };
};

/** 50 windows evenly spaced through the leaves, so more pages load than the budget keeps. */
const scrollThrough = async (grid, service, firstLeafRow) => {
  const windowMs = [];
  const sent = service.stats.leaves;
  service.startPhase();
  const result = { peakLoadedPages: 0, peakRequiredPages: 0, overBudget: [], unsettled: 0, placeholdersLeft: 0 };
  for (let step = 1; step <= SCROLL_WINDOWS; step += 1) {
    const top = firstLeafRow + Math.round((step * (BIG_GROUP - VISIBLE_ROWS)) / SCROLL_WINDOWS);
    const start = now();
    grid.core.setViewport(top * ROW_HEIGHT, 0, VIEWPORT.width, VIEWPORT.height);
    const settled = await settle(grid.core, grid.view);
    windowMs.push(now() - start);
    const budget = loadedWithinBudget(grid, service);
    result.peakLoadedPages = Math.max(result.peakLoadedPages, budget.loaded);
    result.peakRequiredPages = Math.max(result.peakRequiredPages, budget.required);
    if (budget.within === false) result.overBudget.push({ step, ...budget });
    if (settled === false) result.unsettled += 1;
    if (placeholdersMounted(grid.core) > 0) result.placeholdersLeft += 1;
  }
  const total = windowMs.reduce((sum, ms) => sum + ms, 0);
  return {
    ...result,
    scrollMs: total,
    scrollWindowMedianMs: median(windowMs),
    scrollLeafRequests: service.stats.leaves - sent,
    scrollPeakInFlight: service.stats.phasePeakInFlight,
  };
};

const flatRetainedBytes = async (service, workload, rowCount) => {
  const base = retained();
  const source = createServerDataSource(async ({ range }) => {
    await new Promise((resolveTick) => setTimeout(resolveTick, 0));
    const rows = [];
    for (let i = range.startRow; i < Math.min(range.endRow, rowCount); i += 1) rows.push(service.recordOf(i));
    return { rows, totalRows: rowCount };
  });
  const core = new GridCore({
    columns: columnsOf(workload),
    dataSource: source,
    rowHeight: ROW_HEIGHT,
    getRowId: (row) => row.id,
    rowLoading: { cache: EXACT_CACHE },
  });
  core.setViewport(0, 0, VIEWPORT.width, VIEWPORT.height);
  await core.initialize();
  const settled = await settle(core, undefined);
  check(`${workload.name} flat grid loads its viewport`, settled && placeholdersMounted(core) === 0, `settled=${settled}`);
  const bytes = retained() - base;
  core.destroy();
  return bytes;
};

/** Heap delta of the synchronous expand alone, gc before and after; then the expand is undone. */
const measureExpandHeap = async (label, grid, service, bigId, preExpandPages) => {
  const sent = service.stats.leaves;
  const before = retained();
  setExpanded(label, grid.core, [bigId], true);
  const bytes = retained() - before;
  await settle(grid.core, grid.view);
  check(`${label} heap expand sends one leaf request`, service.stats.leaves - sent === 1, `leaves=${service.stats.leaves - sent}`);
  setExpanded(label, grid.core, [bigId], false);
  const pages = grid.view.diagnostics().loadedPages;
  check(`${label} collapse of a one-page branch drops its page`, pages === preExpandPages, `loaded=${pages} before=${preExpandPages}`);
  return { bytes, perPlaceholder: bytes / BIG_GROUP };
};

const PARENT_ID = encodeGroupId(BIG_PATH.slice(0, 1));
const BIG_ID = encodeGroupId(BIG_PATH);

/** Opens r00, whose one child is the 100,000-leaf group; returns the pages loaded before that group opens. */
const openParent = async (label, grid) => {
  setExpanded(label, grid.core, [PARENT_ID], true);
  await settle(grid.core, grid.view);
  return grid.view.diagnostics().loadedPages;
};

/** The request-log grid: root load, the expand's heap, time and leaf requests, retained memory. */
const expandBigGroup = async (label, service, workload) => {
  const base = retained();
  const grid = await mountGrouped(service, workload, EXACT_CACHE);
  const { core, view } = grid;
  checkRootLoad(label, grid, service);
  const preExpandPages = await openParent(label, grid);

  const heap = await measureExpandHeap(label, grid, service, BIG_ID, preExpandPages);
  check(
    `${label} expand retains < ${PLACEHOLDER_BYTES_LIMIT} bytes per placeholder`,
    heap.perPlaceholder < PLACEHOLDER_BYTES_LIMIT,
    `bytes=${heap.bytes} perPlaceholder=${heap.perPlaceholder.toFixed(2)}`,
  );

  const sent = service.stats.leaves;
  const firstRows = grid.nextRows();
  const start = now();
  setExpanded(label, core, [BIG_ID], true);
  const expandMs = now() - start;
  const expandFirstRowsMs = (await firstRows) - start;
  check(`${label} expand applies a rows change`, Number.isFinite(expandFirstRowsMs), "no rows change within the limit");
  await settle(core, view);
  check(`${label} expand sends one leaf request`, service.stats.leaves - sent === 1, `leaves=${service.stats.leaves - sent}`);
  const expandedRows = core.rows.getCount();
  const groupedRetainedBytes = retained() - base;
  unmount(grid);
  return {
    figures: {
      rootLoadMs: grid.rootLoadMs,
      expandMs,
      expandFirstRowsMs,
      expandRetainedBytes: heap.bytes,
      expandBytesPerPlaceholder: heap.perPlaceholder,
      groupedRetainedBytes,
    },
    expandedRows,
  };
};

/** The scroll grid, on `CACHE` and its prefetch: the scroll, its budgets and the collapse. */
const scrollBigGroup = async (label, service, workload) => {
  const grid = await mountGrouped(service, workload, CACHE);
  const preExpandPages = await openParent(label, grid);
  setExpanded(label, grid.core, [BIG_ID], true);
  await settle(grid.core, grid.view);

  const scroll = await scrollThrough(grid, service, grid.view.locate(BIG_ID) + 1);
  check(`${label} scroll keeps loaded pages within max(maxPages, required)`, scroll.overBudget.length === 0, JSON.stringify(scroll.overBudget.slice(0, 3)));
  check(`${label} scroll settles every window with no placeholder mounted`, scroll.unsettled === 0 && scroll.placeholdersLeft === 0, `unsettled=${scroll.unsettled} placeholders=${scroll.placeholdersLeft}`);
  check(`${label} scroll runs past the page budget`, scroll.scrollLeafRequests > CACHE.maxPages, `leafRequests=${scroll.scrollLeafRequests}`);

  const start = now();
  setExpanded(label, grid.core, [BIG_ID], false);
  const collapseMs = now() - start;
  const after = grid.view.diagnostics();
  check(`${label} collapse drops every page of the branch`, after.loadedPages === preExpandPages && after.inFlight === 0, `loaded=${after.loadedPages} inFlight=${after.inFlight} before=${preExpandPages}`);
  unmount(grid);
  const { overBudget, unsettled, placeholdersLeft, ...figures } = scroll;
  return { ...figures, collapseMs, preExpandPages };
};

const sampleBigGroup = async (service, workload) => {
  const label = workload.name;
  service.reset();
  const expand = await expandBigGroup(label, service, workload);
  const { preExpandPages, ...scroll } = await scrollBigGroup(label, service, workload);
  checkService(label, service);
  const flatRetained = await flatRetainedBytes(service, workload, expand.expandedRows);
  return {
    sample: { ...expand.figures, ...scroll, flatRetainedBytes: flatRetained },
    rows: { expandedRows: expand.expandedRows, preExpandPages },
  };
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const readPositiveInteger = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  throw new Error(`${name} must be a positive integer, got ${raw}.`);
};
const ITERATIONS = readPositiveInteger("BENCH_ITERATIONS", 3);
const WARM_UP_SAMPLES = 1;

const median = (values) => {
  const present = values.filter((value) => value !== null);
  if (present.length === 0) return null;
  const sorted = [...present].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const medianSample = (samples) =>
  Object.fromEntries(Object.keys(samples[0]).map((key) => [key, median(samples.map((sample) => sample[key]))]));

const SAMPLERS = { expandAll: sampleExpandAll, bigGroup: sampleBigGroup };

const formatLine = (name, m) => {
  const parts = [`root ${m.rootLoadMs.toFixed(1)}`];
  if (m.expandAllMs !== undefined) {
    parts.push(`expand all ${m.expandAllMs.toFixed(1)} (first rows ${m.expandAllFirstRowsMs.toFixed(1)})`);
  }
  if (m.expandMs !== undefined) {
    parts.push(
      `expand ${m.expandMs.toFixed(1)} (first rows ${m.expandFirstRowsMs.toFixed(1)})`,
      `scroll ${m.scrollMs.toFixed(1)} (window ${m.scrollWindowMedianMs.toFixed(2)})`,
      `collapse ${m.collapseMs.toFixed(2)} ms`,
      `${m.expandBytesPerPlaceholder.toFixed(2)} B/placeholder`,
      `peak pages ${m.peakLoadedPages}`,
    );
  }
  return `  ${name}: ${parts.join(", ")}`;
};

const runWorkload = async (workload) => {
  try {
    const indexStart = now();
    const service = createService(workload);
    const indexMs = now() - indexStart;
    const sampler = SAMPLERS[workload.run];
    for (let warmUp = 0; warmUp < WARM_UP_SAMPLES; warmUp += 1) await sampler(service, workload);
    const runs = [];
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) runs.push(await sampler(service, workload));
    const samples = runs.map((run) => run.sample);
    const result = {
      workload: workload.name,
      description: workload.description,
      dimensions: workload.dimensions,
      groups: service.groupCount,
      indexMs,
      rows: runs[0].rows,
      median: medianSample(samples),
      rawSamples: samples,
    };
    console.log(formatLine(workload.name, result.median));
    return result;
  } catch (error) {
    check(`${workload.name} completed`, false, error instanceof Error ? (error.stack ?? error.message) : String(error));
    return null;
  }
};

const run = async () => {
  const warn = console.warn;
  console.warn = () => {};
  const cases = [];
  console.log(`Server grouping smoke (${LEAF_COUNT} leaves, 1 warm-up, ${ITERATIONS} samples per workload)`);
  for (const workload of WORKLOADS) {
    const result = await runWorkload(workload);
    if (result !== null) cases.push(result);
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
    process.env.BENCH_RUN_ID ?? `prd009-server-grouping-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const outDir = resolve(repoRoot, "benchmarks", "results", "runs", runId);
  const outFile = resolve(outDir, "server-grouping-smoke.json");
  if (existsSync(outFile)) {
    throw new Error(
      `Server grouping smoke output already exists and will not be overwritten: ${outFile}. ` +
        "Use a unique BENCH_RUN_ID or delete the previous result deliberately.",
    );
  }

  const failures = invariants.filter((entry) => entry.pass === false);
  const results = {
    runId,
    generatedAt: new Date().toISOString(),
    scope: "core-only",
    note:
      "Structural invariants are the guarantee; timings and heap deltas are noisy. Retained bytes are " +
      "heapUsed + arrayBuffers after gc. Root load, expand all and the expand run without prefetch, so their " +
      "request counts are exact; the scroll and collapse run on the balanced preset's one-page prefetch. " +
      "expandMs and expandAllMs are the synchronous setExpanded, which " +
      "emits DATA_LOADED; the *FirstRowsMs figures run to the first rows change core applied. Scroll windows " +
      "are evenly spaced through the 100,000 leaves; each waits until no placeholder is mounted or the loader " +
      "is idle. expandRetainedBytes is the synchronous expand alone; groupedRetainedBytes is the source, view " +
      "and core with the group expanded and its first page loaded; flatRetainedBytes a paginated flat grid " +
      "of the same row count and viewport. The service's index is built before either baseline.",
    provenance,
    environment: {
      os: `${os.platform()} ${os.release()}`,
      node: process.version,
      cpuModel: os.cpus().at(0)?.model ?? "unknown",
      logicalCpuCount: os.cpus().length,
      totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
    },
    workload: {
      leafCount: LEAF_COUNT,
      workloads: WORKLOADS.map(({ name, description, dimensions }) => ({ name, description, dimensions })),
      measures: MEASURES,
      grandTotal: "top",
      cache: { scroll: CACHE, requestLog: EXACT_CACHE },
      maxConcurrentRequests: MAX_CONCURRENT_REQUESTS,
      rowHeightPx: ROW_HEIGHT,
      viewport: { ...VIEWPORT, rows: VISIBLE_ROWS },
      scrollWindows: SCROLL_WINDOWS,
      placeholderBytesLimit: PLACEHOLDER_BYTES_LIMIT,
      performance: { warmUpSamplesDiscarded: WARM_UP_SAMPLES, iterations: ITERATIONS, statistic: "median" },
    },
    failedInvariants: failures,
    invariants,
    cases,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  if (failures.length > 0) {
    console.error(`\n${failures.length} server grouping smoke invariant(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${invariants.length} server grouping smoke invariants passed.`);
  }
  console.log("Written to " + outFile);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
