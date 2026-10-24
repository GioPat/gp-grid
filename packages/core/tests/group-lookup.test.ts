// packages/core/tests/group-lookup.test.ts
// PRD 007 D9: group definitions by id before a core exists, agreeing with the
// core's index and bounded like it on deep, wide and cyclic input.

import { describe, expect, it } from "vitest";
import { buildGroupIndex, createColumnGroupLookup } from "../src/column-groups";
import { DEFAULT_COLUMN_GROUP_LIMITS } from "../src/grid-core-config";
import type { ColumnGroupChild, ColumnGroupDefinition } from "../src/types";

const group = (groupId: string, ...children: ColumnGroupChild[]): ColumnGroupDefinition => ({
  groupId,
  headerName: `${groupId} header`,
  children,
});

/** `Region{ North{ Q1{a, b}, c }, d }`, `Totals{ e, f }` and the ungrouped `x`. */
const fixture = (): ColumnGroupChild[] => [
  group("Region", group("North", group("Q1", "a", "b"), "c"), "d"),
  group("Totals", "e", "f"),
  "x",
];

/** A list whose element reads are counted, so a test can bound the walk. */
const counted = <T>(items: readonly T[], counter: { reads: number }): readonly T[] =>
  new Proxy(items, {
    get: (target, key, receiver) => {
      if (typeof key === "string" && /^\d+$/.test(key)) counter.reads += 1;
      return Reflect.get(target, key, receiver) as unknown;
    },
  });

describe("createColumnGroupLookup", () => {
  it("resolves every group of the fixture to the caller's definition, as the core's index does", () => {
    const groups = fixture();
    const lookup = createColumnGroupLookup(groups);
    const built = buildGroupIndex(groups, ["a", "b", "c", "d", "e", "f", "x"], DEFAULT_COLUMN_GROUP_LIMITS);
    if (built.ok === false) throw new Error(built.error.code);
    for (const [groupId, node] of built.index.nodeIndex) {
      expect(lookup(groupId)).toBe(built.index.nodes[node]!.group);
    }
    expect(lookup("Q1")?.headerName).toBe("Q1 header");
  });

  it("resolves nothing for a column id, an unknown id or a missing hierarchy", () => {
    const lookup = createColumnGroupLookup(fixture());
    expect(lookup("a")).toBeUndefined();
    expect(lookup("Nowhere")).toBeUndefined();
    expect(createColumnGroupLookup(undefined)("Region")).toBeUndefined();
    expect(createColumnGroupLookup(null)("Region")).toBeUndefined();
    expect(createColumnGroupLookup({} as unknown as ColumnGroupChild[])("Region")).toBeUndefined();
  });

  it("leaves the caller's descriptors unchanged", () => {
    const groups = fixture();
    const before = structuredClone(groups);
    createColumnGroupLookup(groups)("Q1");
    expect(groups).toEqual(before);
  });

  it("walks a 5,000-deep chain without a stack overflow", () => {
    let child: ColumnGroupChild = "a";
    for (let level = 4_999; level >= 0; level -= 1) child = group(`g${level}`, child);
    const lookup = createColumnGroupLookup([child]);
    expect(lookup("g4999")?.children).toEqual(["a"]);
  });

  it("stops past maxNodes and resolves nothing", () => {
    const wide = Array.from({ length: 200_000 }, (_, i) => group(`g${i}`));
    const counter = { reads: 0 };
    const lookup = createColumnGroupLookup(counted(wide, counter));
    expect(counter.reads).toBeLessThanOrEqual(DEFAULT_COLUMN_GROUP_LIMITS.maxNodes);
    expect(lookup("g0")).toBeUndefined();
  });

  it("walks a cycle and a shared group once", () => {
    const shared = group("Shared", "a");
    const cyclic: ColumnGroupDefinition = { groupId: "Loop", children: [] };
    (cyclic.children as ColumnGroupChild[]).push(cyclic, shared);
    const lookup = createColumnGroupLookup([cyclic, shared, group("Other", shared)]);
    expect(lookup("Loop")).toBe(cyclic);
    expect(lookup("Shared")).toBe(shared);
    expect(lookup("Other")?.children).toEqual([shared]);
  });

  it("keeps the first definition of a repeated id in pre-order", () => {
    const first = group("Dup", "a");
    const lookup = createColumnGroupLookup([group("Outer", first), group("Dup", "b")]);
    expect(lookup("Dup")).toBe(first);
  });
});
