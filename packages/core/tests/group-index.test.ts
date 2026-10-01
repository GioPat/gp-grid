// packages/core/tests/group-index.test.ts
// PRD 007 D6 (AC-007-09, AC-007-10): hierarchy validation, error order,
// budgets on deep and wide input, and the shape of an accepted index.

import { describe, expect, it } from "vitest";
import { buildGroupIndex } from "../src/column-groups";
import type { ColumnGroupIndex, GroupIndexResult } from "../src/column-groups";
import { DEFAULT_COLUMN_GROUP_LIMITS } from "../src/grid-core-config";
import type {
  ColumnGroupChild,
  ColumnGroupDefinition,
  ColumnGroupLimits,
} from "../src/types";

type Limits = Readonly<Required<ColumnGroupLimits>>;

const group = (groupId: string, ...children: ColumnGroupChild[]): ColumnGroupDefinition => ({
  groupId,
  children,
});

/** `Region{ North{ Q1{a, b}, c }, d }`, `Totals{ e, f }` and the ungrouped `x`. */
const fixture = (): ColumnGroupChild[] => [
  group("Region", group("North", group("Q1", "a", "b"), "c"), "d"),
  group("Totals", "e", "f"),
  "x",
];

const FIXTURE_IDS = ["a", "b", "c", "d", "e", "f", "x"];

const build = (
  groups: unknown,
  leafIds: readonly string[] = FIXTURE_IDS,
  limits: Limits = DEFAULT_COLUMN_GROUP_LIMITS,
): GroupIndexResult => buildGroupIndex(groups as readonly ColumnGroupChild[], leafIds, limits);

const errorOf = (result: GroupIndexResult): unknown => (result.ok ? null : result.error);

const indexOf = (result: GroupIndexResult): ColumnGroupIndex => {
  if (result.ok) return result.index;
  throw new Error(`rejected with ${result.error.code}`);
};

/** A chain of `depth` nested groups over one leaf. */
const chain = (depth: number, leaf: string): ColumnGroupChild[] => {
  let child: ColumnGroupChild = leaf;
  for (let level = depth - 1; level >= 0; level -= 1) child = group(`g${level}`, child);
  return [child];
};

/** A list whose element reads are counted, so a test can bound the walk. */
const counted = <T>(items: readonly T[], counter: { reads: number }): readonly T[] =>
  new Proxy(items, {
    get: (target, key, receiver) => {
      if (typeof key === "string" && /^\d+$/.test(key)) counter.reads += 1;
      return Reflect.get(target, key, receiver) as unknown;
    },
  });

describe("buildGroupIndex — accepted hierarchy", () => {
  it("indexes the uneven fixture with one entry per node", () => {
    const index = indexOf(build(fixture()));
    expect(index.leafOrder).toEqual(FIXTURE_IDS);
    expect([...index.leaves.keys()]).toEqual(FIXTURE_IDS);
    expect(index.nodes.map(({ group: node, parent, depth }) => [node.groupId, parent, depth]))
      .toEqual([["Region", -1, 0], ["North", 0, 1], ["Q1", 1, 2], ["Totals", -1, 0]]);
    expect(Object.fromEntries(index.leaves)).toEqual({
      a: { parent: 2, depth: 3 },
      b: { parent: 2, depth: 3 },
      c: { parent: 1, depth: 2 },
      d: { parent: 0, depth: 1 },
      e: { parent: 3, depth: 1 },
      f: { parent: 3, depth: 1 },
      x: { parent: -1, depth: 0 },
    });
    expect([...index.nodeIndex]).toEqual([["Region", 0], ["North", 1], ["Q1", 2], ["Totals", 3]]);
    expect(index.nodes.length + index.leaves.size).toBe(11);
  });

  it("keeps the caller's descriptors by reference and unchanged", () => {
    const groups = fixture();
    const before = structuredClone(groups);
    const index = indexOf(build(groups));
    expect(index.roots).toBe(groups);
    expect(index.nodes[0]?.group).toBe(groups[0]);
    expect(groups).toEqual(before);
  });

  it("accepts an empty group and a flat list of every column", () => {
    const index = indexOf(build([group("empty"), ...FIXTURE_IDS]));
    expect(index.nodes).toHaveLength(1);
    expect(index.leafOrder).toEqual(FIXTURE_IDS);
    expect(indexOf(build([], [])).nodes).toEqual([]);
  });
});

describe("buildGroupIndex — error codes", () => {
  it("reports a group that contains itself or an ancestor as a cycle", () => {
    const children: ColumnGroupChild[] = ["a"];
    const self: ColumnGroupDefinition = { groupId: "self", children };
    children.push(self);
    expect(errorOf(build([self], ["a"]))).toEqual({ code: "cycle", id: "self" });
    const loop: ColumnGroupChild[] = [];
    const outer = group("outer", group("inner", { groupId: "back", children: loop }));
    loop.push(outer);
    expect(errorOf(build([outer], []))).toEqual({ code: "cycle", id: "outer" });
  });

  it("reports the remaining codes with their ids", () => {
    const shared = group("shared", "a");
    const cases: Array<[unknown, readonly string[], unknown]> = [
      [[group("g", "a"), group("g", "b")], ["a", "b"], { code: "duplicateGroup", id: "g" }],
      [["a", "b", "a"], ["a", "b"], { code: "repeatedLeaf", id: "a" }],
      [["a", "z", "b"], ["a", "b"], { code: "unknownLeaf", id: "z" }],
      [["a"], ["a", "b"], { code: "missingLeaf", id: "b" }],
      [[group("g1", shared), group("g2", shared)], ["a"], { code: "multipleParents", id: "shared" }],
      [[shared, shared], ["a"], { code: "multipleParents", id: "shared" }],
      [[group("a", "b")], ["a", "b"], { code: "idCollision", id: "a" }],
    ];
    for (const [groups, leafIds, expected] of cases) {
      expect(errorOf(build(groups, leafIds))).toEqual(expected);
    }
  });

  it("reports every malformed entry, naming the group when it has an id", () => {
    const cases: Array<[unknown, unknown]> = [
      ["a", { code: "malformed" }],
      [null, { code: "malformed" }],
      [[null], { code: "malformed" }],
      [[42], { code: "malformed" }],
      [[["a"]], { code: "malformed" }],
      [[{ groupId: 7, children: [] }], { code: "malformed" }],
      [[{ groupId: "", children: [] }], { code: "malformed" }],
      [[{ groupId: "g" }], { code: "malformed", id: "g" }],
      [[{ groupId: "g", children: "a" }], { code: "malformed", id: "g" }],
      [[group("outer", { groupId: "inner", children: null } as never)], { code: "malformed", id: "inner" }],
    ];
    for (const [groups, expected] of cases) {
      expect(errorOf(build(groups, []))).toEqual(expected);
    }
  });

  it("reports an exceeded budget by name", () => {
    const limits = (overrides: ColumnGroupLimits): Limits => ({ ...DEFAULT_COLUMN_GROUP_LIMITS, ...overrides });
    expect(errorOf(build(["a", "b", "c"], ["a", "b", "c"], limits({ maxNodes: 2 }))))
      .toEqual({ code: "limit", limit: "maxNodes" });
    expect(errorOf(build(chain(2, "a"), ["a"], limits({ maxDepth: 1 }))))
      .toEqual({ code: "limit", limit: "maxDepth" });
    expect(indexOf(build(chain(2, "a"), ["a"], limits({ maxDepth: 2 }))).leaves.get("a")?.depth).toBe(2);
    expect(indexOf(build(["a", "b", "c"], ["a", "b", "c"], limits({ maxNodes: 3 }))).leafOrder).toHaveLength(3);
  });
});

describe("buildGroupIndex — error order", () => {
  it("returns the first error in depth-first traversal order", () => {
    const unknownFirst = [group("g", "a", "zz"), group("g", "b")];
    const duplicateFirst = [group("g", "a"), group("g", "b", "zz")];
    expect(errorOf(build(unknownFirst, ["a", "b"]))).toEqual({ code: "unknownLeaf", id: "zz" });
    expect(errorOf(build(duplicateFirst, ["a", "b"]))).toEqual({ code: "duplicateGroup", id: "g" });
    expect(errorOf(build(unknownFirst, ["a", "b"]))).toEqual(errorOf(build(unknownFirst, ["a", "b"])));
  });

  it("checks a group for a cycle, then multiple parents, then a duplicate id", () => {
    const children: ColumnGroupChild[] = [];
    const self: ColumnGroupDefinition = { groupId: "self", children };
    children.push(self);
    expect(errorOf(build([self], []))).toEqual({ code: "cycle", id: "self" });
    const shared = group("s");
    // `s` is met again under its own id, so it is also a duplicate id.
    expect(errorOf(build([group("p", shared), shared], []))).toEqual({ code: "multipleParents", id: "s" });
  });

  it("checks a leaf for unknown before repeated, and missing leaves after the pass", () => {
    expect(errorOf(build(["zz", "zz"], ["a"]))).toEqual({ code: "unknownLeaf", id: "zz" });
    expect(errorOf(build(["b", "zz"], ["a", "b"]))).toEqual({ code: "unknownLeaf", id: "zz" });
    expect(errorOf(build(["c"], ["a", "b", "c"]))).toEqual({ code: "missingLeaf", id: "a" });
  });

  it("leaves rejected descriptors unchanged", () => {
    const groups = [group("g", "a", "zz"), group("g", "b")];
    const before = structuredClone(groups);
    build(groups, ["a", "b"]);
    expect(groups).toEqual(before);
  });
});

describe("buildGroupIndex — deep and wide input", () => {
  it("builds a 5,000-deep chain under raised limits without a stack overflow", () => {
    const limits = { ...DEFAULT_COLUMN_GROUP_LIMITS, maxDepth: 5_000 };
    const index = indexOf(build(chain(5_000, "a"), ["a"], limits));
    expect(index.nodes).toHaveLength(5_000);
    expect(index.nodes.at(-1)).toMatchObject({ parent: 4_998, depth: 4_999 });
    expect(index.leaves.get("a")).toEqual({ parent: 4_999, depth: 5_000 });
    expect(index.nodes.length + index.leaves.size).toBe(5_001);
  });

  it("stops a 5,000-deep chain at the default depth budget", () => {
    const counter = { reads: 0 };
    let child: ColumnGroupChild = "a";
    for (let level = 4_999; level >= 0; level -= 1) {
      child = { groupId: `g${level}`, children: counted([child], counter) };
    }
    const result = build(counted([child], counter), ["a"]);
    expect(errorOf(result)).toEqual({ code: "limit", limit: "maxDepth" });
    expect(counter.reads).toBeLessThanOrEqual(DEFAULT_COLUMN_GROUP_LIMITS.maxDepth + 2);
  });

  it("stops 200,000 nodes after visiting at most maxNodes + 1", () => {
    const ids = Array.from({ length: 200_000 }, (_, i) => `c${i}`);
    const counter = { reads: 0 };
    const result = build(counted(ids, counter), ids);
    expect(errorOf(result)).toEqual({ code: "limit", limit: "maxNodes" });
    expect(counter.reads).toBeLessThanOrEqual(DEFAULT_COLUMN_GROUP_LIMITS.maxNodes + 1);
  });

  it("counts groups and leaves alike toward maxNodes", () => {
    const wide = Array.from({ length: 200_000 }, (_, i) => group(`g${i}`));
    const counter = { reads: 0 };
    expect(errorOf(build(counted(wide, counter), []))).toEqual({ code: "limit", limit: "maxNodes" });
    expect(counter.reads).toBe(DEFAULT_COLUMN_GROUP_LIMITS.maxNodes + 1);
  });
});
