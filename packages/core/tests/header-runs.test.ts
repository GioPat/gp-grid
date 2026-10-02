// packages/core/tests/header-runs.test.ts
// PRD 007 D7 (AC-007-09, AC-007-11): header runs per band and region, their
// identities, hidden leaves, pins, the fragment budget and the run cache.

import { describe, expect, it } from "vitest";
import {
  buildGroupIndex,
  buildHeaderRuns,
  createHeaderRunsCache,
  leafDepthOf,
  type ColumnGroupIndex,
  type HeaderRunSet,
} from "../src/column-groups";
import { resolveColumnLayout } from "../src/geometry/column-layout";
import { DEFAULT_COLUMN_GROUP_LIMITS } from "../src/grid-core-config";
import type {
  ColumnDefinition,
  ColumnGroupChild,
  ColumnGroupDefinition,
  ColumnLayoutSnapshot,
  HeaderFragment,
} from "../src/types";

const group = (groupId: string, ...children: ColumnGroupChild[]): ColumnGroupDefinition => ({
  groupId,
  children,
});

const column = (id: string, extra: Partial<ColumnDefinition> = {}): ColumnDefinition => ({
  field: id,
  cellDataType: "text",
  width: 120,
  ...extra,
});

/** `Region{ North{ Q1{a, b}, c }, d }`, `Totals{ e, f }` and the ungrouped `x`. */
const prdFixture = (): ColumnGroupChild[] => [
  group("Region", group("North", group("Q1", "a", "b"), "c"), "d"),
  group("Totals", "e", "f"),
  "x",
];

const indexOf = (
  groups: readonly ColumnGroupChild[],
  columns: readonly ColumnDefinition[],
  limits = DEFAULT_COLUMN_GROUP_LIMITS,
): ColumnGroupIndex => {
  const result = buildGroupIndex(groups, columns.map((c) => c.field), limits);
  if (result.ok) return result.index;
  throw new Error(`rejected with ${result.error.code}`);
};

const layoutOf = (
  columns: readonly ColumnDefinition[],
  index: ColumnGroupIndex,
  width = 0,
): ColumnLayoutSnapshot =>
  resolveColumnLayout(
    { columns, mode: "fixed", width, isOverridden: () => false, depthOf: leafDepthOf(index) },
    null,
    1,
  );

const runsOf = (
  columns: readonly ColumnDefinition[],
  groups: readonly ColumnGroupChild[],
  maxFragments = DEFAULT_COLUMN_GROUP_LIMITS.maxFragments,
): HeaderRunSet => {
  const index = indexOf(groups, columns);
  const result = buildHeaderRuns(layoutOf(columns, index), index, maxFragments);
  if (result.ok) return result.runs;
  throw new Error(`runs rejected with ${result.error.code}`);
};

const allRuns = (runs: HeaderRunSet): HeaderFragment[] => [
  ...runs.start,
  ...runs.center.flat(),
  ...runs.end,
];

const spans = (runs: HeaderRunSet): string[] =>
  allRuns(runs).map((run) =>
    `${run.fragmentId}@${run.band}[${run.firstDisplayIndex}+${run.leafCount}]`);

const columnsOf = (...ids: string[]): ColumnDefinition[] => ids.map((id) => column(id));

describe("buildHeaderRuns — the PRD fixture", () => {
  const columns = columnsOf("a", "b", "c", "d", "e", "f", "x");

  it("gives four bands and one run per group", () => {
    const index = indexOf(prdFixture(), columns);
    const layout = layoutOf(columns, index);
    expect(layout.bandCount).toBe(4);
    expect(layout.columns.map((c) => [c.columnId, c.headerBand])).toEqual([
      ["a", 3], ["b", 3], ["c", 2], ["d", 1], ["e", 1], ["f", 1], ["x", 0],
    ]);
    const result = buildHeaderRuns(layout, index, 100);
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.runs.count).toBe(4);
    expect(result.runs.center.map((band) => band.map((run) => run.groupId))).toEqual([
      ["Region", "Totals"],
      ["North"],
      ["Q1"],
    ]);
    expect(result.runs.center[0]![0]).toEqual({
      groupId: "Region",
      band: 0,
      region: "center",
      runIndex: 0,
      firstDisplayIndex: 0,
      leafCount: 4,
      regionOffset: 0,
      width: 480,
      fragmentId: "Region:center:0",
    });
    expect(result.runs.center[0]![1]).toMatchObject({
      fragmentId: "Totals:center:0",
      firstDisplayIndex: 4,
      leafCount: 2,
      regionOffset: 480,
      width: 240,
    });
    expect(result.runs.start).toEqual([]);
    expect(result.runs.end).toEqual([]);
  });

  it("follows the displayed order, not the descriptor order", () => {
    const reordered = columnsOf("x", "d", "a", "c", "b", "e", "f");
    expect(spans(runsOf(reordered, prdFixture()))).toEqual([
      "Region:center:0@0[1+4]",
      "Totals:center:0@0[5+2]",
      "North:center:0@1[2+3]",
      "Q1:center:0@2[2+1]",
      "Q1:center:1@2[4+1]",
    ]);
  });
});

describe("buildHeaderRuns — moves, visibility and pins", () => {
  const groups = [group("G", "a", "b"), "x"];

  it("splits a group around an unrelated leaf and joins it when moved back", () => {
    expect(spans(runsOf(columnsOf("a", "b", "x"), groups))).toEqual(["G:center:0@0[0+2]"]);
    expect(spans(runsOf(columnsOf("a", "x", "b"), groups))).toEqual([
      "G:center:0@0[0+1]",
      "G:center:1@0[2+1]",
    ]);
    expect(spans(runsOf(columnsOf("a", "b", "x"), groups))).toEqual(["G:center:0@0[0+2]"]);
  });

  it("gives a hidden leaf no span and a group without visible leaves no run", () => {
    const columns = [column("a"), column("b", { hidden: true }), column("c"), column("x")];
    const runs = runsOf(columns, [group("G", "a", "b", "c"), group("H", "x")]);
    expect(spans(runs)).toEqual(["G:center:0@0[0+2]", "H:center:0@0[2+1]"]);
    expect(runs.center[0]![0]!.width).toBe(240);

    const hiddenGroup = [column("a"), column("b", { hidden: true }), column("x")];
    expect(spans(runsOf(hiddenGroup, [group("G", "a"), group("H", "b"), "x"])))
      .toEqual(["G:center:0@0[0+1]"]);
  });

  it("counts bands from the visible hierarchy only", () => {
    const columns = [column("a", { hidden: true }), column("x")];
    const index = indexOf([group("G", group("H", "a")), "x"], columns);
    const layout = layoutOf(columns, index);
    expect(layout.bandCount).toBe(1);
    const result = buildHeaderRuns(layout, index, 100);
    expect(result.ok && result.runs.count).toBe(0);
  });

  it("splits a run across the start, center and end regions", () => {
    const columns = [
      column("a", { pinned: "start" }),
      column("b"),
      column("c", { pinned: "end" }),
      column("x"),
    ];
    const runs = runsOf(columns, [group("G", "a", "b", "c"), "x"]);
    expect(runs.start.map((run) => run.fragmentId)).toEqual(["G:start:0"]);
    expect(runs.center[0]!.map((run) => run.fragmentId)).toEqual(["G:center:0"]);
    expect(runs.end.map((run) => run.fragmentId)).toEqual(["G:end:0"]);
    expect(runs.end[0]).toMatchObject({ firstDisplayIndex: 3, leafCount: 1, regionOffset: 0 });
  });

  it("keeps run identities unique across groups, regions and runs", () => {
    const columns = columnsOf("a", "x", "b", "y", "c");
    const runs = runsOf(columns, [group("G", "a", "b", "c"), "x", "y"]);
    const ids = allRuns(runs).map((run) => run.fragmentId);
    expect(ids).toEqual(["G:center:0", "G:center:1", "G:center:2"]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("buildHeaderRuns — budgets and depth", () => {
  const columns = columnsOf("a", "b", "c", "d", "e", "f", "x");

  it("returns limit past maxFragments runs", () => {
    const index = indexOf(prdFixture(), columns);
    const layout = layoutOf(columns, index);
    expect(buildHeaderRuns(layout, index, 4).ok).toBe(true);
    expect(buildHeaderRuns(layout, index, 3)).toEqual({
      ok: false,
      error: { code: "limit", limit: "maxFragments" },
    });
  });

  it("builds a 2,000-deep chain without recursion", () => {
    let child: ColumnGroupChild = "a";
    for (let level = 1_999; level >= 0; level -= 1) child = group(`g${level}`, child);
    const leaves = columnsOf("a");
    const limits = { ...DEFAULT_COLUMN_GROUP_LIMITS, maxDepth: 2_000 };
    const index = indexOf([child], leaves, limits);
    const layout = layoutOf(leaves, index);
    expect(layout.bandCount).toBe(2_001);
    const result = buildHeaderRuns(layout, index, 10_000);
    expect(result.ok && result.runs.count).toBe(2_000);
    expect(result.ok && result.runs.center[1_999]![0]!.groupId).toBe("g1999");
  });
});

describe("createHeaderRunsCache", () => {
  const columns = columnsOf("a", "b", "c", "d", "e", "f", "x");

  it("reuses the run set while the layout and the index are the same objects", () => {
    const cache = createHeaderRunsCache(100);
    const index = indexOf(prdFixture(), columns);
    const layout = layoutOf(columns, index);
    const first = cache.get(layout, index);
    expect(first?.count).toBe(4);
    expect(cache.get(layout, index)).toBe(first);
    expect(cache.get({ ...layout }, index)).not.toBe(first);
    expect(cache.get(layout, indexOf(prdFixture(), columns))).not.toBe(first);
  });

  it("answers null while flat or over the budget", () => {
    const index = indexOf(prdFixture(), columns);
    const layout = layoutOf(columns, index);
    expect(createHeaderRunsCache(100).get(layout, null)).toBeNull();
    expect(createHeaderRunsCache(3).get(layout, index)).toBeNull();
  });
});
