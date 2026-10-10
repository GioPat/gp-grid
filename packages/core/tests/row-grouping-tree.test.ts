import { describe, expect, it } from "vitest";
import { compareValues } from "../src/indexed-data-store/sorting";
import { buildGroupTree, groupIdOf, type GroupTree, type MeasureValues } from "../src/row-grouping/group-tree";
import { TAG_BOOLEAN, TAG_DATE, TAG_NULL, TAG_NUMBER, TAG_STRING, keyOf, keyTagOf, keyValue } from "../src/row-grouping/keys";
import type { CellValue, RowGroupDimension, SortModel } from "../src/types";
import { columnarSource, objectSource, seededRandom, toColumns } from "./row-grouping-source";

type Row = Record<string, CellValue | undefined>;

const ROWS: Row[] = [
  { country: "IT", city: "Rome", amount: 5 },
  { country: "FR", city: "Paris", amount: 1 },
  { country: "IT", city: "Milan", amount: 20 },
  { country: null, city: "Nowhere", amount: 2 },
  { country: "IT", city: "Rome", amount: 7 },
  { country: "FR", city: "Lyon", amount: 3 },
  { city: "Nowhere", amount: 4 },
];
const DIMENSIONS: RowGroupDimension[] = [{ field: "country" }, { field: "city" }];

const build = (rows: Row[], sort: SortModel[] = [], dimensions = DIMENSIONS) =>
  buildGroupTree(objectSource(rows, { sort }), dimensions) as GroupTree;

const keysAt = (tree: GroupTree, depth: number) =>
  Array.from({ length: tree.groupCount }, (_, g) => g)
    .filter((g) => tree.depth[g] === depth)
    .map((g) => keyValue(tree.tag[g]!, tree.key[g]!));

const leavesOf = (tree: GroupTree, group: number) =>
  Array.from(tree.leafOrder.subarray(tree.leafStart[group], tree.leafEnd[group]));

const childrenOf = (tree: GroupTree, group: number) => {
  const children: number[] = [];
  for (let child = group + 1; child < tree.end[group]!; child = tree.end[child]!) children.push(child);
  return children;
};

const snapshot = (tree: GroupTree) => ({
  ids: Array.from({ length: tree.groupCount }, (_, g) => groupIdOf(tree, g)),
  arrays: [tree.depth, tree.parent, tree.end, tree.childCount, tree.leafStart, tree.leafEnd].map((a) =>
    Array.from(a),
  ),
  leafOrder: Array.from(tree.leafOrder),
  rowGroup: Array.from(tree.rowGroup),
});

const sumOf: MeasureValues = (tree, field) => {
  const read = objectSource(ROWS).reader(field);
  return (group) => leavesOf(tree, group).reduce((sum, row) => sum + (read(row) as number), 0);
};

describe("buildGroupTree", () => {
  it("builds the same tree from object and columnar rows", () => {
    const columnar = buildGroupTree(columnarSource(toColumns(ROWS, ["country", "city", "amount"])), DIMENSIONS);
    expect(snapshot(columnar as GroupTree)).toEqual(snapshot(build(ROWS)));
  });

  it("numbers groups in pre-order with ranges covering their descendants", () => {
    const tree = build(ROWS);
    expect(keysAt(tree, 0)).toEqual(["FR", "IT", null]);
    expect(tree.rootChildCount).toBe(3);
    for (let g = 0; g < tree.groupCount; g++) {
      const children = childrenOf(tree, g);
      expect(children.length).toBe(tree.childCount[g]);
      for (const child of children) {
        expect(tree.parent[child]).toBe(g);
        expect(tree.leafStart[child]).toBeGreaterThanOrEqual(tree.leafStart[g]!);
        expect(tree.leafEnd[child]).toBeLessThanOrEqual(tree.leafEnd[g]!);
      }
      if (tree.depth[g] === 0) {
        const leaves = children.reduce((sum, c) => sum + tree.leafEnd[c]! - tree.leafStart[c]!, 0);
        expect(leaves).toBe(tree.leafEnd[g]! - tree.leafStart[g]!);
      }
    }
  });

  it("lists every flat position once and keeps the flat order inside each terminal group", () => {
    const tree = build(ROWS);
    expect(Array.from(tree.leafOrder).sort((a, b) => a - b)).toEqual(ROWS.map((_, i) => i));
    for (let g = 0; g < tree.groupCount; g++) {
      if (tree.depth[g] === 0) continue;
      const leaves = leavesOf(tree, g);
      expect(leaves).toEqual([...leaves].sort((a, b) => a - b));
    }
    const rome = keysAt(tree, 1).indexOf("Rome");
    const romeGroup = Array.from({ length: tree.groupCount }, (_, g) => g).filter((g) => tree.depth[g] === 1)[rome]!;
    expect(leavesOf(tree, romeGroup)).toEqual([0, 4]);
    expect(tree.rowGroup[4]).toBe(romeGroup);
  });

  it("orders a sorted dimension column by key in its direction", () => {
    const tree = build(ROWS, [{ colId: "country", direction: "desc" }]);
    expect(keysAt(tree, 0)).toEqual([null, "IT", "FR"]);
    expect(keysAt(tree, 1).slice(1)).toEqual(["Milan", "Rome", "Lyon", "Paris"]);
  });

  it("orders by the aggregate when the first sorted column is a measure", () => {
    const sort: SortModel[] = [{ colId: "amount", direction: "desc" }];
    const tree = buildGroupTree(objectSource(ROWS, { sort }), DIMENSIONS, {
      measureFields: ["amount"],
      measureValues: sumOf,
    }) as GroupTree;
    expect(keysAt(tree, 0)).toEqual(["IT", null, "FR"]);
    expect(keysAt(tree, 1)).toEqual(["Milan", "Rome", "Nowhere", "Lyon", "Paris"]);
    expect(snapshot(tree).leafOrder).toEqual([2, 0, 4, 3, 6, 5, 1]);
  });

  it("orders by key when the first sorted column is neither a dimension nor a measure", () => {
    const tree = buildGroupTree(objectSource(ROWS, { sort: [{ colId: "amount", direction: "desc" }] }), DIMENSIONS, {
      measureFields: [],
      measureValues: sumOf,
    }) as GroupTree;
    expect(keysAt(tree, 0)).toEqual(["FR", "IT", null]);
  });

  it("orders mixed-type keys by type, null last, and reverses the whole order descending", () => {
    const rows = [{ k: "b" }, { k: true }, { k: null }, { k: 2 }, { k: new Date(1) }, { k: "a" }, { k: false }, { k: 1 }];
    const dimensions = [{ field: "k" }];
    const ascending = [1, 2, new Date(1), false, true, "a", "b", null];
    expect(keysAt(build(rows, [], dimensions), 0)).toEqual(ascending);
    expect(keysAt(build(rows, [{ colId: "k", direction: "desc" }], dimensions), 0)).toEqual([...ascending].reverse());
  });

  it("matches a naive grouping over randomized mixed-type rows", () => {
    const random = seededRandom(42);
    const pools: Record<string, CellValue[]> = {
      a: ["a", "b", "", null, "c", true, false, 0, 7],
      b: [0, 1, "1", 2, null, "x", true, new Date(1)],
      c: [true, false, new Date(5), null, 3, "z", 5, "3"],
    };
    const pick = (field: string) => {
      const pool = pools[field]!;
      return pool[Math.floor(random() * pool.length)]!;
    };
    for (let run = 0; run < 30; run++) {
      const rows = Array.from({ length: 1 + Math.floor(random() * 80) }, () => ({ a: pick("a"), b: pick("b"), c: pick("c") }));
      const dimensions = [{ field: "a" }, { field: "b", id: "bee" }, { field: "c" }];
      const direction = run % 2 === 0 ? 1 : -1;
      const sort: SortModel[] = direction === 1 ? [] : [{ colId: "a", direction: "desc" }];
      expect(describeTree(build(rows, sort, dimensions))).toEqual(naiveGrouping(rows, dimensions, direction));
    }
  });
});

interface NaiveGroup {
  id: string;
  leaves: number[];
}

const describeTree = (tree: GroupTree): NaiveGroup[] =>
  Array.from({ length: tree.groupCount }, (_, g) => ({ id: groupIdOf(tree, g), leaves: leavesOf(tree, g) }));

const TYPE_ORDER = [TAG_NUMBER, TAG_DATE, TAG_BOOLEAN, TAG_STRING, TAG_NULL];

/** Recursive grouping into maps, siblings sorted by type then key: the reference. */
const naiveGrouping = (rows: Row[], dimensions: { field: string; id?: string }[], firstDirection = 1): NaiveGroup[] => {
  const out: NaiveGroup[] = [];
  const visit = (positions: number[], depth: number, parentId: string | null): number[] => {
    const dimension = dimensions[depth];
    if (!dimension) return positions;
    const buckets = new Map<string, { tag: number; key: CellValue; positions: number[] }>();
    for (const position of positions) {
      const raw = rows[position]![dimension.field] ?? null;
      const tag = keyTagOf(raw);
      const key = keyOf(raw, tag);
      const name = JSON.stringify([tag, key]);
      const bucket = buckets.get(name) ?? { tag, key, positions: [] };
      bucket.positions.push(position);
      buckets.set(name, bucket);
    }
    const direction = depth === 0 ? firstDirection : 1;
    const byType = (x: { tag: number }, y: { tag: number }) => TYPE_ORDER.indexOf(x.tag) - TYPE_ORDER.indexOf(y.tag);
    const sorted = [...buckets.values()].sort((x, y) => direction * (byType(x, y) || compareValues(x.key, y.key)));
    return sorted.flatMap((bucket) => {
      const id = naiveId(parentId, dimension.id ?? dimension.field, bucket.tag, bucket.key);
      const group: NaiveGroup = { id, leaves: [] };
      out.push(group);
      group.leaves = visit(bucket.positions, depth + 1, id);
      return group.leaves;
    });
  };
  visit(rows.map((_, i) => i), 0, null);
  return out;
};

const naiveId = (parentId: string | null, dimensionId: string, tag: number, key: CellValue): string => {
  const step = [dimensionId, ["z", "s", "n", "b", "d"][tag], key];
  const path = parentId === null ? [] : (JSON.parse(parentId.slice("gp-group:".length)) as unknown[]);
  return `gp-group:${JSON.stringify([...path, step])}`;
};
