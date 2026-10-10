import { describe, expect, it } from "vitest";
import { foldMeasure, foldRange, aggregatorOf } from "../src/row-grouping/aggregators";
import { buildGroupTree, type GroupTree } from "../src/row-grouping/group-tree";
import type { CellValue, RowGroupAggregator, RowGroupBuiltInAggregate } from "../src/types";
import { columnarSource, objectSource, seededRandom, toColumns } from "./row-grouping-source";

type Row = Record<string, CellValue | undefined>;

const treeOf = (rows: Row[], fields: string[]) =>
  buildGroupTree(objectSource(rows), fields.map((field) => ({ field }))) as GroupTree;

const leafValues = (tree: GroupTree, rows: Row[], group: number, field: string) =>
  Array.from(tree.leafOrder.subarray(tree.leafStart[group], tree.leafEnd[group])).map((row) => rows[row]![field] ?? null);

const finite = (values: CellValue[]) =>
  values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));

const ORACLES: Record<RowGroupBuiltInAggregate, (values: CellValue[]) => CellValue> = {
  sum: (values) => (finite(values).length === 0 ? null : finite(values).reduce((a, b) => a + b, 0)),
  avg: (values) => (finite(values).length === 0 ? null : finite(values).reduce((a, b) => a + b, 0) / finite(values).length),
  count: (values) => values.filter((value) => value !== null).length,
  min: (values) => (finite(values).length === 0 ? null : Math.min(...finite(values))),
  max: (values) => (finite(values).length === 0 ? null : Math.max(...finite(values))),
};

const BUILT_INS = Object.keys(ORACLES) as RowGroupBuiltInAggregate[];

describe("row grouping aggregators", () => {
  it("matches an oracle per group, for object and columnar rows", () => {
    const random = seededRandom(7);
    const numbers: (CellValue | undefined)[] = [1, 2.5, -3, 0, null, undefined, 40];
    const mixed: (CellValue | undefined)[] = [...numbers, NaN, Infinity, "7", true, new Date(3)];
    for (let run = 0; run < 20; run++) {
      const pool = run % 2 === 0 ? numbers : mixed;
      const rows: Row[] = Array.from({ length: 1 + Math.floor(random() * 60) }, () => ({
        g: Math.floor(random() * 3),
        h: Math.floor(random() * 4),
        v: pool[Math.floor(random() * pool.length)],
      }));
      const tree = treeOf(rows, ["g", "h"]);
      const sources = [objectSource(rows), columnarSource(toColumns(rows, ["g", "h", "v"]))];
      for (const aggregate of BUILT_INS) {
        if (pool === mixed && (aggregate === "min" || aggregate === "max")) continue;
        for (const source of sources) {
          const { values } = foldMeasure(tree, source, { field: "v", aggregate });
          for (let group = 0; group < tree.groupCount; group++) {
            expect(values[group]).toEqual(ORACLES[aggregate](leafValues(tree, rows, group, "v")));
          }
          expect(values[tree.groupCount]).toEqual(ORACLES[aggregate](rows.map((row) => row.v ?? null)));
        }
      }
    }
  });

  it("gives null for no number and zero for no value, empty groups included", () => {
    const rows: Row[] = [{ g: "a", v: null }, { g: "a" }, { g: "a", v: "x" }, { g: "a", v: NaN }];
    const tree = treeOf(rows, ["g"]);
    const source = objectSource(rows);
    const at = (aggregate: RowGroupBuiltInAggregate) => foldMeasure(tree, source, { field: "v", aggregate }).values[0];
    expect([at("sum"), at("avg"), at("count")]).toEqual([null, null, 2]);
    const read = source.reader("v");
    const empty = BUILT_INS.map((aggregate) => foldRange(aggregatorOf({ field: "v", aggregate }), read, tree.leafOrder, 0, 0));
    expect(empty).toEqual([null, null, 0, null, null]);
  });

  it("orders min and max of non-numbers with compareValues and skips null", () => {
    const rows: Row[] = [{ g: 1, v: "pear" }, { g: 1, v: null }, { g: 1, v: "apple" }, { g: 2, v: new Date(9) }, { g: 2, v: new Date(4) }];
    const tree = treeOf(rows, ["g"]);
    const min = foldMeasure(tree, objectSource(rows), { field: "v", aggregate: "min" }).values;
    const max = foldMeasure(tree, objectSource(rows), { field: "v", aggregate: "max" }).values;
    expect([min[0], max[0], min[1], max[1]]).toEqual(["apple", "pear", new Date(4), new Date(9)]);
  });

  it("weights a parent average by its leaves, not by its children's averages", () => {
    const rows: Row[] = [{ a: "x", b: 1, v: 1 }, { a: "x", b: 1, v: 1 }, { a: "x", b: 1, v: 1 }, { a: "x", b: 2, v: 10 }];
    const tree = treeOf(rows, ["a", "b"]);
    const { values } = foldMeasure(tree, objectSource(rows), { field: "v", aggregate: "avg" });
    expect(values.slice(0, 3)).toEqual([3.25, 1, 10]);
  });

  it("adds sibling sums up to their parent and keeps the total out of every group", () => {
    const random = seededRandom(3);
    const rows: Row[] = Array.from({ length: 200 }, () => ({
      a: Math.floor(random() * 4),
      b: Math.floor(random() * 5),
      v: Math.floor(random() * 100),
    }));
    const tree = treeOf(rows, ["a", "b"]);
    const { values } = foldMeasure(tree, objectSource(rows), { field: "v", aggregate: "sum" });
    const sumOf = (groups: number[]) => groups.reduce((sum, group) => sum + (values[group] as number), 0);
    const roots: number[] = [];
    for (let group = 0; group < tree.groupCount; group = tree.end[group]!) roots.push(group);
    expect(sumOf(roots)).toBe(values[tree.groupCount]);
    expect(values[tree.groupCount]).toBe(rows.reduce((sum, row) => sum + (row.v as number), 0));
    for (const root of roots) {
      const children: number[] = [];
      for (let child = root + 1; child < tree.end[root]!; child = tree.end[child]!) children.push(child);
      expect(sumOf(children)).toBe(values[root]);
    }
  });

  it("refolds after removing an extremum", () => {
    const rows: Row[] = [{ g: "a", v: 3 }, { g: "a", v: 9 }, { g: "a", v: 5 }];
    const tree = treeOf(rows, ["g"]);
    const fold = foldMeasure(tree, objectSource(rows), { field: "v", aggregate: "max" });
    expect(fold.values).toEqual([9, 9]);
    rows[1]!.v = 1;
    fold.refold([0, tree.groupCount]);
    expect(fold.values).toEqual([5, 5]);
  });

  it("feeds a custom aggregator every value, null included, and reads it under the measure field", () => {
    const rows: Row[] = [{ g: "a", v: "x" }, { g: "a" }, { g: "a", v: "y" }, { g: "b", v: "x" }];
    const distinct: RowGroupAggregator<Set<CellValue>> = {
      init: () => new Set(),
      add: (seen, value) => seen.add(value),
      result: (seen) => [...seen].map(String).join("|"),
    };
    const tree = treeOf(rows, ["g"]);
    const fold = foldMeasure(tree, objectSource(rows), { field: "labels", source: "v", aggregate: distinct });
    expect(fold.sourceField).toBe("v");
    expect(fold.values).toEqual(["x|null|y", "x", "x|null|y"]);
  });

  it("merges children's states into a parent, reading each leaf once, as a full fold would", () => {
    const random = seededRandom(11);
    const rows: Row[] = Array.from({ length: 120 }, () => ({
      a: Math.floor(random() * 3),
      b: Math.floor(random() * 4),
      v: Math.floor(random() * 50),
    }));
    let adds = 0;
    const plain: RowGroupAggregator<number[]> = {
      init: () => [],
      add: (seen, value) => {
        adds += 1;
        seen.push(value as number);
        return seen;
      },
      result: (seen) => seen.join(","),
    };
    const merging: RowGroupAggregator<number[]> = { ...plain, merge: (into, from) => [...into, ...from] };
    const tree = treeOf(rows, ["a", "b"]);
    const folded = foldMeasure(tree, objectSource(rows), { field: "v", aggregate: plain }).values;
    adds = 0;
    const merged = foldMeasure(tree, objectSource(rows), { field: "v", aggregate: merging }).values;
    expect(adds).toBe(rows.length);
    expect(merged).toEqual(folded);
  });

  it("refolds a path by folding the terminal group's leaves and merging upward", () => {
    const rows: Row[] = [
      { a: "x", b: "p", v: 1 },
      { a: "x", b: "q", v: 2 },
      { a: "y", b: "p", v: 4 },
      { a: "x", b: "p", v: 8 },
    ];
    let adds = 0;
    const counting: RowGroupAggregator<number> = {
      init: () => 0,
      add: (sum, value) => {
        adds += 1;
        return sum + (value as number);
      },
      result: (sum) => sum,
      merge: (into, from) => into + from,
    };
    const tree = treeOf(rows, ["a", "b"]);
    const fold = foldMeasure(tree, objectSource(rows), { field: "v", aggregate: counting });
    rows[3]!.v = 16;
    adds = 0;
    // x, x/p and the root.
    fold.refold([tree.groupCount, 0, 1]);
    expect(adds).toBe(2);
    expect([fold.values[0], fold.values[1], fold.values[tree.groupCount]]).toEqual([19, 17, 23]);
  });
});
