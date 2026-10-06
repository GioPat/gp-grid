import { describe, expect, it } from "vitest";
import { buildGroupTree, groupIdOf, type GroupTree } from "../src/row-grouping/group-tree";
import {
  TAG_BOOLEAN,
  TAG_DATE,
  TAG_NULL,
  TAG_NUMBER,
  TAG_STRING,
  childGroupId,
  decodeGroupId,
  encodeGroupId,
  keyOf,
  keyTagOf,
  keyValue,
  type GroupPathStep,
} from "../src/row-grouping/keys";
import type { CellValue, RowGroupDimension } from "../src/types";
import { columnarSource, objectSource, seededRandom } from "./row-grouping-source";

const build = (rows: Record<string, CellValue | undefined>[], dimensions: RowGroupDimension[]) =>
  buildGroupTree(objectSource(rows), dimensions) as GroupTree;

const ids = (tree: GroupTree) =>
  Array.from({ length: tree.groupCount }, (_, group) => groupIdOf(tree, group));

describe("row grouping keys", () => {
  it("puts undefined, null and a missing field in one bucket for object and columnar rows", () => {
    const objects = build([{ k: undefined }, { k: null }, {}], [{ field: "k" }]);
    const columns = buildGroupTree(columnarSource({ k: [undefined, null, null] }), [
      { field: "k" },
    ]) as GroupTree;
    for (const tree of [objects, columns]) {
      expect(tree.groupCount).toBe(1);
      expect(tree.tag[0]).toBe(TAG_NULL);
      expect(tree.leafEnd[0]! - tree.leafStart[0]!).toBe(3);
    }
    expect(ids(objects)).toEqual(ids(columns));
  });

  it("keeps empty string, zero, false and the string zero apart", () => {
    const tree = build([{ k: "" }, { k: 0 }, { k: false }, { k: "0" }, { k: -0 }, { k: null }], [
      { field: "k" },
    ]);
    expect(tree.groupCount).toBe(5);
    expect(new Set(ids(tree)).size).toBe(5);
  });

  it("keeps a number and its string apart", () => {
    const tree = build([{ k: 1 }, { k: "1" }, { k: 1 }], [{ field: "k" }]);
    expect(tree.groupCount).toBe(2);
    expect(new Set(ids(tree)).size).toBe(2);
  });

  it("keys a Date by its timestamp, apart from the same number", () => {
    const at = 1_700_000_000_000;
    const tree = build([{ k: new Date(at) }, { k: at }, { k: new Date(at) }], [{ field: "k" }]);
    expect(tree.groupCount).toBe(2);
    const dateGroup = Array.from(tree.tag).indexOf(TAG_DATE);
    expect(tree.leafEnd[dateGroup]! - tree.leafStart[dateGroup]!).toBe(2);
    expect(keyValue(TAG_DATE, tree.key[dateGroup]!)).toEqual(new Date(at));
    expect(new Set(ids(tree)).size).toBe(2);
  });

  it("gives two bucketings of one field different ids", () => {
    const rows = [{ n: 1 }, { n: 2 }, { n: 3 }];
    const parity = build(rows, [{ field: "n", id: "parity", toKey: (v) => (v as number) % 2 }]);
    const odd = build(rows, [{ field: "n", id: "odd", toKey: (v) => (v as number) % 2 }]);
    expect(parity.groupCount).toBe(2);
    expect(ids(parity).some((id) => ids(odd).includes(id))).toBe(false);
  });

  it("rejects an object value without toKey and accepts it with one", () => {
    const rows = [{ k: { code: "a" } }, { k: { code: "b" } }];
    expect(build(rows, [{ field: "k" }])).toEqual({ reason: "object-key", field: "k" });
    const keyed = build(rows, [{ field: "k", toKey: (v) => (v as { code: string }).code }]);
    expect(keyed.groupCount).toBe(2);
  });

  it("encodes a path as JSON triples and decodes it back", () => {
    const path: GroupPathStep[] = [
      ["country", TAG_STRING, "IT"],
      ["year", TAG_NUMBER, 2024],
    ];
    const id = encodeGroupId(path);
    expect(id).toBe('gp-group:[["country","s","IT"],["year","n",2024]]');
    expect(decodeGroupId(id)).toEqual(path);
    expect(childGroupId(childGroupId(null, ...path[0]!), ...path[1]!)).toBe(id);
  });

  it("writes a non-finite number as a string", () => {
    const id = encodeGroupId([["k", TAG_NUMBER, Number.NaN]]);
    expect(id).toBe('gp-group:[["k","n","NaN"]]');
    expect(decodeGroupId(id)).toEqual([["k", TAG_NUMBER, Number.NaN]]);
  });

  it("decodes nothing that is not a group id", () => {
    for (const id of [1, "gp-total", "gp-group:", "gp-group:{}", 'gp-group:[["k","x",1]]', 'gp-group:[["k","s",1]]']) {
      expect(decodeGroupId(id)).toBeUndefined();
    }
  });

  it("round-trips randomized mixed keys", () => {
    const random = seededRandom(7);
    const pick = (): unknown => {
      const choice = Math.floor(random() * 8);
      const values: unknown[] = [
        null,
        `s"${Math.floor(random() * 50)}\\é`,
        Math.floor(random() * 100) - 50,
        random() * 1e6,
        random() < 0.5,
        new Date(Math.floor(random() * 1e12)),
        [Number.NaN, Infinity, -Infinity][Math.floor(random() * 3)],
        "",
      ];
      return values[choice];
    };
    for (let i = 0; i < 300; i++) {
      const depth = 1 + Math.floor(random() * 3);
      const path: GroupPathStep[] = Array.from({ length: depth }, (_, level) => {
        const value = pick();
        const tag = keyTagOf(value);
        return [`dim${level}`, tag, keyOf(value, tag)];
      });
      expect(decodeGroupId(encodeGroupId(path))).toEqual(path);
    }
  });

  it("tags booleans and folds -0 into 0", () => {
    expect(keyTagOf(true)).toBe(TAG_BOOLEAN);
    expect(Object.is(keyOf(-0, TAG_NUMBER), 0)).toBe(true);
  });
});
