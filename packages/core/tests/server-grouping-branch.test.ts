import { describe, expect, it } from "vitest";
import { decodeGroupId, encodeGroupId } from "../src/hierarchy/group-path";
import { Branch, createGroupNode, parsePendingId, pendingId, type GroupNode } from "../src/server-grouping/branch";
import type { GroupPathStep } from "../src/types";
import { seededRandom } from "./row-grouping-source";

type Row = { n: number };

const groupsOf = (branch: Branch<Row>, page: number, prefix = "g"): GroupNode[] => {
  const start = page * branch.pageSize;
  const count = Math.min(branch.pageSize, branch.childCount - start);
  return Array.from({ length: count }, (_, offset) =>
    createGroupNode(branch.path, "region", { key: `${prefix}${start + offset}`, childCount: 3, leafCount: 6 }),
  );
};

const childOf = (branch: Branch<Row>, ordinal: number, childCount: number, pageSize = 2) =>
  new Branch<Row>([...branch.path, ["region", "s", `g${ordinal}`]], childCount, pageSize);

describe("createGroupNode", () => {
  it("appends its step to the parent path and encodes the id", () => {
    const parent: GroupPathStep[] = [["region", "s", "north"]];
    const node = createGroupNode(parent, "t", { key: 2, childCount: 4, leafCount: 9, aggregates: { amount: 5 } });
    const path = [["region", "s", "north"], ["t", "n", 2]];
    expect(node).toEqual({ kind: "group", id: encodeGroupId(node.path), path, key: 2, childCount: 4, leafCount: 9, aggregates: { amount: 5 } });
    expect(decodeGroupId(node.id)).toEqual(path);
    expect(parent).toHaveLength(1);
  });

  it("normalizes each key by its tag and exposes a date as a Date", () => {
    const nodeOf = (key: unknown) => createGroupNode([], "d", { key: key as Date, childCount: 1, leafCount: 1 });
    const date = nodeOf(new Date(5000));
    expect(date.path[0]).toEqual(["d", "d", 5000]);
    expect(date.key).toEqual(new Date(5000));
    expect(Object.is(nodeOf(-0).key, 0)).toBe(true);
    expect(nodeOf(undefined).path[0]).toEqual(["d", "z", null]);
    expect(nodeOf(null).key).toBeNull();
    expect(nodeOf(false).path[0]).toEqual(["d", "b", false]);
    expect(nodeOf(NaN).id).toBe(encodeGroupId([["d", "n", "NaN"]]));
    expect(nodeOf("x").aggregates).toEqual({});
  });

  it("rejects an object key", () => {
    expect(() => createGroupNode([], "d", { key: { a: 1 }, childCount: 1, leafCount: 1 })).toThrow(RangeError);
  });
});

describe("pending ids", () => {
  it("round-trips under the root and under a group whose key holds '@'", () => {
    const root = encodeGroupId([]);
    expect(pendingId(root, 0)).toBe("gp-pending:0@gp-group:[]");
    const parent = encodeGroupId([["region", "s", "a@b"]]);
    expect(parsePendingId(pendingId(root, 0))).toEqual({ parentId: root, ordinal: 0 });
    expect(parsePendingId(pendingId(parent, 125))).toEqual({ parentId: parent, ordinal: 125 });
  });

  it.each([7, "gp-group:[]", "gp-pending:@x", "gp-pending:01@x", "gp-pending:-1@x", "gp-pending:1x", "gp-pending:99999999999999999999@x"])(
    "answers undefined for %s",
    (id) => {
      expect(parsePendingId(id)).toBeUndefined();
    },
  );
});

describe("Branch pages", () => {
  it("maps ordinals to pages, the last one partial", () => {
    const branch = new Branch<Row>([], 10, 4);
    expect([0, 3, 4, 9].map((ordinal) => branch.pageOf(ordinal))).toEqual([0, 0, 1, 2]);
    const nodes = groupsOf(branch, 2);
    branch.setPage(2, nodes);
    expect(branch.isLoaded(2)).toBe(true);
    expect(branch.isLoaded(1)).toBe(false);
    expect(branch.nodeAt(9)).toBe(nodes[1]);
    expect(branch.nodeAt(7)).toBeUndefined();
    expect(branch.groupOrdinal(nodes[1]!.id)).toBe(9);
    expect([...branch.pages.keys()]).toEqual([2]);
  });

  it("rejects a page of the wrong length or out of range", () => {
    const branch = new Branch<Row>([], 10, 4);
    expect(() => branch.setPage(0, groupsOf(branch, 2))).toThrow(RangeError);
    for (const page of [3, -1, 0.5]) expect(() => branch.setPage(page, [])).toThrow(RangeError);
    expect(branch.pages.size).toBe(0);
  });

  it("replaces and deletes a page with its group lookup", () => {
    const branch = new Branch<Row>([], 6, 3);
    const first = groupsOf(branch, 0, "a");
    const second = groupsOf(branch, 0, "x");
    branch.setPage(0, first);
    branch.setPage(0, second);
    expect(branch.groupOrdinal(first[1]!.id)).toBe(-1);
    expect(branch.groupOrdinal(second[1]!.id)).toBe(1);
    branch.deletePage(0);
    branch.deletePage(0);
    expect(branch.isLoaded(0)).toBe(false);
    expect(branch.nodeAt(1)).toBeUndefined();
    expect(branch.groupOrdinal(second[1]!.id)).toBe(-1);
  });

  it("keeps a page size of at least one", () => {
    expect(new Branch<Row>([], 3, 0).pageSize).toBe(1);
    expect(new Branch<Row>([], 3, 2.5).pageSize).toBe(2);
  });
});

describe("Branch rows", () => {
  it("counts one row per ordinal, loaded or not", () => {
    const branch = new Branch<Row>([], 10, 4);
    expect(branch.rows()).toBe(10);
    branch.setPage(1, groupsOf(branch, 1));
    expect(branch.rows()).toBe(10);
    branch.deletePage(1);
    expect(branch.rows()).toBe(10);
  });

  it("adds the rows of expanded children, invalidated upward", () => {
    const root = new Branch<Row>([], 10, 4);
    const child = childOf(root, 2, 5);
    root.expandChild(2, child);
    expect(root.rows()).toBe(15);
    const grandchild = childOf(child, 1, 7);
    child.expandChild(1, grandchild);
    expect(root.rows()).toBe(22);
    expect(child.rows()).toBe(12);
    expect(grandchild.parent).toEqual({ branch: child, ordinal: 1 });
    expect(child.collapseChild(1)).toBe(grandchild);
    expect(root.rows()).toBe(15);
  });

  it("keeps expanded children sorted with their prefix sums", () => {
    const root = new Branch<Row>([], 10, 4);
    root.expandChild(4, childOf(root, 4, 5));
    root.expandChild(1, childOf(root, 1, 3));
    root.expandChild(6, childOf(root, 6, 0));
    expect(root.expanded.map((entry) => entry.ordinal)).toEqual([1, 4, 6]);
    expect([0, 1, 2, 5, 7].map((ordinal) => root.expandedBefore(ordinal))).toEqual([0, 0, 1, 2, 3]);
    expect([0, 1, 2, 3].map((count) => root.rowsBefore(count))).toEqual([0, 3, 8, 8]);
    expect(root.rows()).toBe(18);
  });

  it("drops a collapsed branch and replaces one expanded at the same ordinal", () => {
    const root = new Branch<Row>([], 10, 4);
    const first = childOf(root, 2, 5);
    const second = childOf(root, 2, 1);
    root.expandChild(2, first);
    root.expandChild(2, second);
    expect(first.parent).toBeNull();
    expect(root.expanded).toHaveLength(1);
    expect(root.childBranch(second.id)).toBe(second);
    expect(root.rows()).toBe(11);
    expect(root.collapseChild(2)).toBe(second);
    expect(root.collapseChild(2)).toBeUndefined();
    expect(second.parent).toBeNull();
    expect(root.expandedAt(2)).toBeUndefined();
    expect(root.childBranch(second.id)).toBeUndefined();
    expect(root.rows()).toBe(10);
  });

  it("rejects an ordinal out of range", () => {
    const root = new Branch<Row>([], 10, 4);
    for (const ordinal of [10, -1, 1.5]) expect(() => root.expandChild(ordinal, childOf(root, 0, 1))).toThrow(RangeError);
    expect(root.hasOrdinal(9)).toBe(true);
  });

  it("keeps an expanded child whose page is deleted", () => {
    const root = new Branch<Row>([], 10, 4);
    const nodes = groupsOf(root, 0);
    root.setPage(0, nodes);
    const child = childOf(root, 1, 4);
    root.expandChild(1, child);
    root.deletePage(0);
    expect(root.nodeAt(1)).toBeUndefined();
    expect(root.groupOrdinal(nodes[1]!.id)).toBe(-1);
    expect(root.expandedAt(1)).toBe(child);
    expect(root.childBranch(child.id)).toBe(child);
    expect(root.rows()).toBe(14);
  });

  it("matches a model through random expand, collapse, setPage and deletePage", () => {
    const random = seededRandom(9);
    const int = (max: number) => Math.floor(random() * max);
    const root = new Branch<Row>([], 12, 3);
    const model = new Map<Branch<Row>, Map<number, Branch<Row>>>([[root, new Map()]]);
    const count = (branch: Branch<Row>): number =>
      [...model.get(branch)!.values()].reduce((sum, child) => sum + count(child), branch.childCount);
    const forget = (gone: Branch<Row>): void => {
      for (const child of model.get(gone)!.values()) forget(child);
      model.delete(gone);
    };
    for (let step = 0; step < 400; step++) {
      const live = [...model.keys()].filter((branch) => branch.childCount > 0);
      const branch = live[int(live.length)]!;
      const children = model.get(branch)!;
      const ordinal = int(branch.childCount);
      const page = branch.pageOf(ordinal);
      const action = int(4);
      const current = children.get(ordinal);
      if (action === 0 && branch.depth < 3) {
        const child = childOf(branch, ordinal, int(6), 1 + int(3));
        branch.expandChild(ordinal, child);
        if (current !== undefined) forget(current);
        children.set(ordinal, child);
        model.set(child, new Map());
      }
      if (action === 1) {
        expect(branch.collapseChild(ordinal)).toBe(current);
        children.delete(ordinal);
        if (current !== undefined) forget(current);
      }
      if (action === 2) branch.setPage(page, groupsOf(branch, page));
      if (action === 3) branch.deletePage(page);
      for (const each of model.keys()) expect(each.rows()).toBe(count(each));
    }
    expect(model.size).toBeGreaterThan(5);
  });

  it("is terminal at the dimension count", () => {
    const root = new Branch<Row>([], 4, 2);
    const leaves = childOf(childOf(root, 0, 2), 1, 3);
    expect(root.isTerminal(2)).toBe(false);
    expect(leaves.depth).toBe(2);
    expect(leaves.isTerminal(2)).toBe(true);
    expect(root.isTerminal(0)).toBe(true);
  });
});
