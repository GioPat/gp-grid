// PRD 012 D5 folds: sparse states by group and leaf tuple, parents by merge and refold, row totals.

import { describe, expect, it } from "vitest";
import { foldMeasure } from "../src/hierarchy/aggregators";
import { findGroup } from "../src/hierarchy/group-lookup";
import { encodeGroupId } from "../src/hierarchy/group-path";
import { buildGroupTree, type GroupTree } from "../src/hierarchy/group-tree";
import { foldPivotMeasure, type PivotFold } from "../src/pivot/pivot-fold";
import { buildPivotKeys, type PivotKeys } from "../src/pivot/pivot-keys";
import type { CellValue, RowGroupAggregator, RowGroupMeasure } from "../src/types";
import { objectSource } from "./row-grouping-source";
import { SALES } from "./pivot-sales";

const source = objectSource(SALES);
const ROWS = [{ field: "region" }, { field: "city" }];

const treeOf = (): GroupTree => {
  const tree = buildGroupTree(source, ROWS);
  if ("reason" in tree) throw new Error(tree.reason);
  return tree;
};

const keysOf = (domain?: Record<string, CellValue[]>): PivotKeys => {
  const keys = buildPivotKeys(source, [{ field: "year" }, { field: "quarter" }], domain);
  if ("objectKey" in keys) throw new Error(keys.objectKey);
  return keys;
};

const tree = treeOf();
const keys = keysOf();
const ROOT = tree.groupCount;
const NORTH = findGroup(tree, encodeGroupId([["region", "s", "North"]]));
const OSLO = findGroup(tree, encodeGroupId([["region", "s", "North"], ["city", "s", "Oslo"]]));
const BERGEN = findGroup(tree, encodeGroupId([["region", "s", "North"], ["city", "s", "Bergen"]]));
const ROME = findGroup(tree, encodeGroupId([["region", "s", "South"], ["city", "s", "Rome"]]));
const SOUTH = findGroup(tree, encodeGroupId([["region", "s", "South"]]));
const GROUPS = { OSLO, BERGEN, NORTH, ROME, SOUTH, ROOT };

const fold = (measure: RowGroupMeasure, pivotKeys = keys): PivotFold =>
  foldPivotMeasure(tree, source, measure, pivotKeys.tupleOf);

/** Values at tuples 2024/Q1, 2024/Q2 and 2025/Q1 for every group. */
const table = (pivot: PivotFold) =>
  Object.fromEntries(Object.entries(GROUPS).map(([name, group]) => [name, [0, 1, 2].map((t) => pivot.valueAt(group, t))]));

describe("foldPivotMeasure", () => {
  it("sum fills terminals, parents and the root", () => {
    expect(table(fold({ field: "amount", aggregate: "sum" }))).toEqual({
      OSLO: [10, 20, null],
      BERGEN: [5, null, 7],
      NORTH: [15, 20, 7],
      ROME: [null, 3, 10],
      SOUTH: [null, 3, 10],
      ROOT: [15, 23, 17],
    });
  });

  it("count, avg, min and max", () => {
    expect(table(fold({ field: "amount", aggregate: "count" })).ROOT).toEqual([2, 2, 3]);
    expect(table(fold({ field: "amount", aggregate: "count" })).OSLO).toEqual([1, 1, null]);
    expect(table(fold({ field: "amount", aggregate: "avg" })).NORTH).toEqual([7.5, 20, 7]);
    expect(table(fold({ field: "amount", aggregate: "avg" })).ROOT).toEqual([7.5, 11.5, 17 / 3]);
    expect(table(fold({ field: "amount", aggregate: "min" })).ROOT).toEqual([5, 3, 4]);
    expect(table(fold({ field: "amount", aggregate: "max" })).ROOT).toEqual([10, 20, 7]);
    expect(table(fold({ field: "amount", aggregate: "max" })).SOUTH).toEqual([null, 3, 6]);
  });

  it("a custom aggregator gives equal results with and without merge", () => {
    const product: RowGroupAggregator<number> = {
      init: () => 1,
      add: (state, value) => state * (typeof value === "number" ? value : 1),
      result: (state) => state,
    };
    const withMerge: RowGroupAggregator<number> = { ...product, merge: (into, from) => into * from };
    const merged = fold({ field: "amount", aggregate: withMerge as RowGroupAggregator });
    const refolded = fold({ field: "amount", aggregate: product as RowGroupAggregator });
    expect(table(merged)).toEqual(table(refolded));
    expect(table(merged).ROOT).toEqual([50, 60, 168]);
  });

  it("merging leaves the children's states intact", () => {
    const pivot = fold({ field: "amount", aggregate: "sum" });
    expect(pivot.states[OSLO]!.get(0)).toEqual({ sum: 10, count: 1 });
    expect(pivot.states[NORTH]!.get(0)).toEqual({ sum: 15, count: 2 });
  });

  it("a map holds only the intersections with data", () => {
    const pivot = fold({ field: "amount", aggregate: "sum" });
    const tuples = (group: number) => [...pivot.states[group]!.keys()].sort();
    expect(tuples(OSLO)).toEqual([0, 1]);
    expect(tuples(BERGEN)).toEqual([0, 2]);
    expect(tuples(ROME)).toEqual([1, 2]);
    expect(tuples(SOUTH)).toEqual([1, 2]);
    expect(tuples(ROOT)).toEqual([0, 1, 2]);
    const refolded = fold({ field: "amount", aggregate: { init: () => 0, add: (s: number) => s + 1, result: (s: number) => s } as RowGroupAggregator });
    expect([...refolded.states[SOUTH]!.keys()].sort()).toEqual([1, 2]);
  });

  it("row totals fold every row, those outside a domain included", () => {
    const inDomain = keysOf({ year: [2024] });
    const pivot = fold({ field: "amount", aggregate: "sum" }, inDomain);
    expect([pivot.valueAt(ROOT, 0), pivot.valueAt(ROOT, 1)]).toEqual([15, 23]);
    expect(pivot.valueAt(ROME, 0)).toBeNull();
    const totals = foldMeasure(tree, source, { field: "amount", aggregate: "sum" }).values;
    expect([totals[ROOT], totals[SOUTH], totals[BERGEN]]).toEqual([55, 13, 12]);
  });
});
