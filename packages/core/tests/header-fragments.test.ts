// packages/core/tests/header-fragments.test.ts
// PRD 007 D7 (AC-007-09, AC-007-11): the fragments of a column window are the
// pin runs plus the center runs intersecting the mounted range, and the
// window object is reused while nothing it depends on changed.

import { describe, expect, it } from "vitest";
import {
  EMPTY_HEADER_FRAGMENTS,
  buildGroupIndex,
  buildHeaderRuns,
  createHeaderRunsCache,
  leafDepthOf,
  selectHeaderFragments,
  type ColumnGroupIndex,
  type HeaderRunSet,
} from "../src/column-groups";
import { resolveColumnLayout } from "../src/geometry/column-layout";
import { createColumnWindowResolver } from "../src/geometry/column-window";
import { DEFAULT_COLUMN_GROUP_LIMITS } from "../src/grid-core-config";
import type {
  AxisBounds,
  ColumnDefinition,
  ColumnGroupChild,
  ColumnLayoutSnapshot,
} from "../src/types";

const LEAVES = 10_000;
const WIDTH = 100;

/** 2,500 groups of 4 leaves under 250 groups of 10; two start pins, one end pin. */
const wideSchema = (): { columns: ColumnDefinition[]; groups: ColumnGroupChild[] } => {
  const columns = Array.from({ length: LEAVES }, (_, at): ColumnDefinition => {
    const pinned = at < 2 ? "start" : undefined;
    return {
      field: `c${at}`,
      cellDataType: "text",
      width: WIDTH,
      pinned: at === LEAVES - 1 ? "end" : pinned,
    };
  });
  const inner = Array.from({ length: LEAVES / 4 }, (_, at) => ({
    groupId: `g${at}`,
    children: [0, 1, 2, 3].map((leaf) => `c${at * 4 + leaf}`),
  }));
  const groups = Array.from({ length: inner.length / 10 }, (_, at) => ({
    groupId: `G${at}`,
    children: inner.slice(at * 10, at * 10 + 10),
  }));
  return { columns, groups };
};

const indexOf = (groups: ColumnGroupChild[], columns: ColumnDefinition[]): ColumnGroupIndex => {
  const result = buildGroupIndex(
    groups,
    columns.map((column) => column.field),
    DEFAULT_COLUMN_GROUP_LIMITS,
  );
  if (result.ok) return result.index;
  throw new Error(`rejected with ${result.error.code}`);
};

const layoutOf = (
  columns: ColumnDefinition[],
  index: ColumnGroupIndex | null,
): ColumnLayoutSnapshot =>
  resolveColumnLayout(
    {
      columns,
      mode: "fixed",
      width: 1_000,
      isOverridden: () => false,
      depthOf: leafDepthOf(index),
    },
    null,
    1,
  );

const runsOf = (layout: ColumnLayoutSnapshot, index: ColumnGroupIndex): HeaderRunSet => {
  const result = buildHeaderRuns(layout, index, DEFAULT_COLUMN_GROUP_LIMITS.maxFragments);
  if (result.ok) return result.runs;
  throw new Error(`runs rejected with ${result.error.code}`);
};

/** Linear oracle: every center run whose leaves intersect `range`. */
const intersecting = (runs: HeaderRunSet, range: AxisBounds): string[] =>
  runs.center
    .flat()
    .filter((run) =>
      run.firstDisplayIndex < range.end && run.firstDisplayIndex + run.leafCount > range.start)
    .map((run) => run.fragmentId);

describe("selectHeaderFragments over 10,000 leaves", () => {
  const { columns, groups } = wideSchema();
  const index = indexOf(groups, columns);
  const layout = layoutOf(columns, index);
  const runs = runsOf(layout, index);

  it("keeps every pin run and only the center runs that intersect the range", () => {
    expect(layout.regions).toMatchObject({ centerStart: 2, centerEnd: LEAVES - 1 });
    expect(runs.start.map((run) => run.fragmentId)).toEqual(["G0:start:0", "g0:start:0"]);
    expect(runs.end.map((run) => run.fragmentId)).toEqual(["G249:end:0", "g2499:end:0"]);
    for (const range of [
      { start: 2, end: 12 },
      { start: 4_998, end: 5_011 },
      { start: 9_990, end: LEAVES - 1 },
    ]) {
      const fragments = selectHeaderFragments(runs, range);
      expect(fragments.start).toBe(runs.start);
      expect(fragments.end).toBe(runs.end);
      expect(fragments.center.map((run) => run.fragmentId).sort())
        .toEqual(intersecting(runs, range).sort());
    }
    const middle = selectHeaderFragments(runs, { start: 4_998, end: 5_011 });
    expect(middle.center.map((run) => run.fragmentId)).toEqual([
      "G124:center:0",
      "G125:center:0",
      "g1249:center:0",
      "g1250:center:0",
      "g1251:center:0",
      "g1252:center:0",
    ]);
  });

  it("mounts no center run for an empty range", () => {
    expect(selectHeaderFragments(runs, { start: 40, end: 40 }).center).toEqual([]);
  });

  it("shares the empty lists while flat", () => {
    expect(selectHeaderFragments(null, { start: 2, end: 12 })).toBe(EMPTY_HEADER_FRAGMENTS);
    expect(EMPTY_HEADER_FRAGMENTS.center).toBe(EMPTY_HEADER_FRAGMENTS.start);
  });
});

describe("column window fragments", () => {
  const { columns, groups } = wideSchema();
  const index = indexOf(groups, columns);
  const layout = layoutOf(columns, index);

  const resolverFor = (state: { scrollLeft: number; index: ColumnGroupIndex | null }) => {
    const cache = createHeaderRunsCache(DEFAULT_COLUMN_GROUP_LIMITS.maxFragments);
    return createColumnWindowResolver({
      getLayout: () => layout,
      getScrollLeft: () => state.scrollLeft,
      getViewportWidth: () => 1_000,
      getOverscan: () => 0,
      getHeaderRuns: (current) => cache.get(current, state.index),
    });
  };

  it("returns the same window object for an unchanged or same-range scroll sample", () => {
    const state = { scrollLeft: 500_050, index: index as ColumnGroupIndex | null };
    const resolver = resolverFor(state);
    const first = resolver.get();
    expect(first.groups.center.length).toBeGreaterThan(0);
    expect(resolver.get()).toBe(first);
    state.scrollLeft += 1;
    expect(resolver.get()).toBe(first);
    state.scrollLeft += 50_000;
    const moved = resolver.get();
    expect(moved).not.toBe(first);
    expect(moved.groups.start).toBe(first.groups.start);
    expect(moved.groups.center.map((run) => run.fragmentId))
      .not.toEqual(first.groups.center.map((run) => run.fragmentId));
  });

  it("replaces the window when the hierarchy changes under the same layout", () => {
    const state = { scrollLeft: 0, index: index as ColumnGroupIndex | null };
    const resolver = resolverFor(state);
    const grouped = resolver.get();
    state.index = null;
    const flat = resolver.get();
    expect(flat).not.toBe(grouped);
    expect(flat.groups).toBe(EMPTY_HEADER_FRAGMENTS);
  });
});
