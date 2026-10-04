// packages/core/src/column-groups/header-runs.ts
// Header runs (PRD 007 D7): per band and admitted region, one run per maximal
// contiguous set of displayed leaves under the same group. Pure over a layout
// snapshot and an index; the work is O(displayed leaves × depth) and happens
// when either is replaced, never on scroll.

import type { ColumnLayoutSnapshot, ColumnRegion, ResolvedColumn } from "../types/geometry";
import type { HeaderFragment } from "../types/column-groups";
import { flatDepthOf } from "../geometry/column-layout";
import type { ColumnGroupIndex, ColumnSchemaFault } from "./group-index";

/** Every run of one layout under one hierarchy, as fragments. */
export interface HeaderRunSet {
  /** Start-pin runs, band by band, each band in display order. */
  readonly start: readonly HeaderFragment[];
  /** Center runs per band, in display order, for a binary search per band. */
  readonly center: readonly (readonly HeaderFragment[])[];
  /** End-pin runs, band by band, each band in display order. */
  readonly end: readonly HeaderFragment[];
  readonly count: number;
}

export type HeaderRunsResult =
  | { readonly ok: true; readonly runs: HeaderRunSet }
  | { readonly ok: false; readonly error: ColumnSchemaFault };

interface OpenRun {
  readonly node: number;
  readonly region: ColumnRegion;
  readonly firstDisplayIndex: number;
  readonly regionOffset: number;
  leafCount: number;
  width: number;
}

type RegionBands = Record<ColumnRegion, HeaderFragment[][]>;

interface RunBuild {
  readonly index: ColumnGroupIndex;
  readonly maxFragments: number;
  /** The open run of each group band. */
  readonly open: (OpenRun | null)[];
  /** Scratch: the ancestor of the current leaf at each band. */
  readonly ancestors: number[];
  readonly closed: RegionBands;
  /** Runs met so far per group and region, keyed `node * 3 + region`. */
  readonly ordinals: Map<number, number>;
  count: number;
}

const REGION_ORDINAL: Record<ColumnRegion, number> = { start: 0, center: 1, end: 2 };

const NO_RUNS: readonly HeaderFragment[] = Object.freeze([]);

export const EMPTY_HEADER_RUNS: HeaderRunSet = Object.freeze({
  start: NO_RUNS,
  center: Object.freeze([]),
  end: NO_RUNS,
  count: 0,
});

const OVER_BUDGET: ColumnSchemaFault = { code: "limit", limit: "maxFragments" };

/** `ColumnLayoutInput.depthOf` for an index: a leaf's first band, 0 while flat. */
export const leafDepthOf = (
  index: ColumnGroupIndex | null,
): ((columnId: string) => number) => {
  if (index === null) return flatDepthOf;
  return (columnId) => index.leaves.get(columnId)?.depth ?? 0;
};

/** Record the leaf's ancestor at each band above it; returns its depth. */
const fillAncestors = (build: RunBuild, columnId: string): number => {
  const leaf = build.index.leaves.get(columnId);
  if (leaf === undefined) return 0;
  let node = leaf.parent;
  while (node !== -1) {
    const entry = build.index.nodes[node]!;
    build.ancestors[entry.depth] = node;
    node = entry.parent;
  }
  return leaf.depth;
};

const closeRun = (build: RunBuild, band: number, run: OpenRun): ColumnSchemaFault | null => {
  if (build.count >= build.maxFragments) return OVER_BUDGET;
  build.count += 1;
  const { groupId } = build.index.nodes[run.node]!.group;
  const key = run.node * 3 + REGION_ORDINAL[run.region];
  const runIndex = build.ordinals.get(key) ?? 0;
  build.ordinals.set(key, runIndex + 1);
  const bands = build.closed[run.region];
  const runs = bands[band] ?? [];
  bands[band] = runs;
  runs.push({
    groupId,
    band,
    region: run.region,
    runIndex,
    firstDisplayIndex: run.firstDisplayIndex,
    leafCount: run.leafCount,
    regionOffset: run.regionOffset,
    width: run.width,
    fragmentId: `${groupId}:${run.region}:${runIndex}`,
  });
  return null;
};

const openRun = (node: number, column: ResolvedColumn, displayIndex: number): OpenRun => ({
  node,
  region: column.region,
  firstDisplayIndex: displayIndex,
  regionOffset: column.regionOffset,
  leafCount: 1,
  width: column.width,
});

/** Extend or close the open run of every group band with one more leaf. */
const advanceBands = (
  build: RunBuild,
  column: ResolvedColumn,
  displayIndex: number,
  depth: number,
): ColumnSchemaFault | null => {
  for (let band = 0; band < build.open.length; band++) {
    const node = band < depth ? build.ancestors[band]! : -1;
    const open = build.open[band];
    if (open?.node === node && open.region === column.region) {
      open.leafCount += 1;
      open.width += column.width;
      continue;
    }
    const fault = open ? closeRun(build, band, open) : null;
    if (fault) return fault;
    build.open[band] = node === -1 ? null : openRun(node, column, displayIndex);
  }
  return null;
};

const closeOpenRuns = (build: RunBuild): ColumnSchemaFault | null => {
  for (let band = 0; band < build.open.length; band++) {
    const open = build.open[band];
    const fault = open ? closeRun(build, band, open) : null;
    if (fault) return fault;
  }
  return null;
};

const walkColumns = (build: RunBuild, columns: readonly ResolvedColumn[]): ColumnSchemaFault | null => {
  for (let displayIndex = 0; displayIndex < columns.length; displayIndex++) {
    const column = columns[displayIndex]!;
    const depth = fillAncestors(build, column.columnId);
    const fault = advanceBands(build, column, displayIndex, depth);
    if (fault) return fault;
  }
  return closeOpenRuns(build);
};

const bandLists = (bands: readonly HeaderFragment[][], bandCount: number): HeaderFragment[][] =>
  Array.from({ length: bandCount }, (_, band) => bands[band] ?? []);

/**
 * The runs of `layout` under `index`. More than `maxFragments` runs returns
 * `limit` before the next run is allocated.
 */
export const buildHeaderRuns = (
  layout: ColumnLayoutSnapshot,
  index: ColumnGroupIndex,
  maxFragments: number,
): HeaderRunsResult => {
  const groupBands = layout.bandCount - 1;
  if (groupBands === 0) return { ok: true, runs: EMPTY_HEADER_RUNS };
  const build: RunBuild = {
    index,
    maxFragments,
    open: Array.from({ length: groupBands }, () => null),
    ancestors: [],
    closed: { start: [], center: [], end: [] },
    ordinals: new Map(),
    count: 0,
  };
  const fault = walkColumns(build, layout.columns);
  if (fault) return { ok: false, error: fault };
  const runs: HeaderRunSet = {
    start: bandLists(build.closed.start, groupBands).flat(),
    center: bandLists(build.closed.center, groupBands),
    end: bandLists(build.closed.end, groupBands).flat(),
    count: build.count,
  };
  return { ok: true, runs };
};

/** Runs of `layout` under `index`; `null` while flat or over the budget. */
export const resolveHeaderRuns = (
  layout: ColumnLayoutSnapshot,
  index: ColumnGroupIndex | null,
  maxFragments: number,
): HeaderRunSet | null => {
  if (index === null) return null;
  const result = buildHeaderRuns(layout, index, maxFragments);
  return result.ok ? result.runs : null;
};

export interface HeaderRunsCache {
  /** Runs of `layout` under `index`; `null` while flat or over the budget. */
  get(layout: ColumnLayoutSnapshot, index: ColumnGroupIndex | null): HeaderRunSet | null;
}

/** Caches one run set on the identity of its layout and its index. */
export const createHeaderRunsCache = (maxFragments: number): HeaderRunsCache => {
  let cache: {
    layout: ColumnLayoutSnapshot;
    index: ColumnGroupIndex;
    runs: HeaderRunSet | null;
  } | null = null;
  return {
    get: (layout, index) => {
      if (index === null) return null;
      if (cache?.layout === layout && cache.index === index) return cache.runs;
      cache = { layout, index, runs: resolveHeaderRuns(layout, index, maxFragments) };
      return cache.runs;
    },
  };
};
