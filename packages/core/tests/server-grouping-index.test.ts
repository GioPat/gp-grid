import { describe, expect, it } from "vitest";
import { Branch, createGroupNode, pendingId, type BranchNode } from "../src/server-grouping/branch";
import { createViewIndex, type GrandTotalPlacement, type ViewRowRef } from "../src/server-grouping/view-index";
import type { AxisBounds, GroupPathStep } from "../src/types";
import { seededRandom } from "./row-grouping-source";

type Row = { n: number };
type B = Branch<Row>;

const DIMENSIONS = ["region", "team", "city"];
const PLACEMENTS = [undefined, "top", "bottom"] as const;

const step = (depth: number, key: string): GroupPathStep => [DIMENSIONS[depth]!, "s", key];

/** Group nodes keyed `k<ordinal>` with child counts from `counts`, or leaves with ids `<branch id>#<ordinal>`. */
const nodesOf = (branch: B, page: number, counts: readonly number[] | null): BranchNode<Row>[] => {
  const start = page * branch.pageSize;
  const length = Math.min(branch.pageSize, branch.childCount - start);
  return Array.from({ length }, (_, offset): BranchNode<Row> => {
    const ordinal = start + offset;
    if (counts === null) return { kind: "leaf", id: `${branch.id}#${ordinal}`, record: { n: ordinal } };
    const node = { key: `k${ordinal}`, childCount: counts[ordinal] ?? 0, leafCount: 0 };
    return createGroupNode(branch.path, DIMENSIONS[branch.depth]!, node);
  });
};

interface Tree {
  root: B;
  all: B[];
  children: Map<B, Map<number, B>>;
  loaded: Map<B, Set<number>>;
}

/** Random page sizes, loaded pages and expansion, expanded children in unloaded pages included. */
const randomTree = (seed: number): Tree => {
  const random = seededRandom(seed);
  const int = (max: number) => Math.floor(random() * max);
  const dimensionCount = 2 + int(2);
  const tree: Tree = { root: undefined!, all: [], children: new Map(), loaded: new Map() };
  const grow = (path: readonly GroupPathStep[], childCount: number): B => {
    const branch = new Branch<Row>(path, childCount, 1 + int(5));
    const terminal = branch.isTerminal(dimensionCount);
    const counts = Array.from({ length: childCount }, () => int(7));
    const loaded = new Set<number>();
    for (let page = 0; page * branch.pageSize < childCount; page++) {
      if (random() < 0.5) continue;
      branch.setPage(page, nodesOf(branch, page, terminal ? null : counts));
      loaded.add(page);
    }
    tree.all.push(branch);
    tree.loaded.set(branch, loaded);
    tree.children.set(branch, new Map());
    const opened = terminal ? [] : [...counts.keys()].filter(() => random() < 0.35);
    for (const ordinal of opened.sort(() => random() - 0.5)) {
      const child = grow([...path, step(branch.depth, `k${ordinal}`)], counts[ordinal]!);
      branch.expandChild(ordinal, child);
      tree.children.get(branch)!.set(ordinal, child);
    }
    return branch;
  };
  tree.root = grow([], 1 + int(14));
  return tree;
};

const materialize = (tree: Tree, total: GrandTotalPlacement | undefined): ViewRowRef<Row>[] => {
  const rows: ViewRowRef<Row>[] = [];
  const visit = (branch: B) => {
    for (let ordinal = 0; ordinal < branch.childCount; ordinal++) {
      rows.push({ kind: "ordinal", branch, ordinal });
      const child = tree.children.get(branch)!.get(ordinal);
      if (child !== undefined) visit(child);
    }
  };
  visit(tree.root);
  if (total === "top") rows.unshift({ kind: "total" });
  if (total === "bottom") rows.push({ kind: "total" });
  return rows;
};

const naivePages = (tree: Tree, rows: ViewRowRef<Row>[], range: AxisBounds): string[] => {
  const pages = new Set<string>();
  for (const row of rows.slice(Math.max(range.start, 0), Math.max(range.end, 0))) {
    if (row.kind === "total") continue;
    const page = Math.floor(row.ordinal / row.branch.pageSize);
    if (tree.loaded.get(row.branch)!.has(page)) continue;
    pages.add(`${tree.all.indexOf(row.branch)}:${page}`);
  }
  return [...pages];
};

const expectMatches = (tree: Tree, total: GrandTotalPlacement | undefined, random: () => number) => {
  const index = createViewIndex(tree.root, total);
  const rows = materialize(tree, total);
  const label = (row: ViewRowRef<Row> | undefined) =>
    row?.kind === "ordinal" ? `${tree.all.indexOf(row.branch)}:${row.ordinal}` : String(row?.kind);
  expect(index.rowCount()).toBe(rows.length);
  expect(index.totalIndex()).toBe(rows.findIndex((row) => row.kind === "total"));
  expect(rows.map((_, view) => label(index.rowAt(view)))).toEqual(rows.map(label));
  expect([-1, rows.length, 0.5].map((view) => index.rowAt(view))).toEqual([undefined, undefined, undefined]);
  for (const [view, row] of rows.entries()) {
    if (row.kind === "ordinal") expect(index.indexOf(row.branch, row.ordinal)).toBe(view);
  }
  for (let sample = 0; sample < 25; sample++) {
    const start = Math.floor(random() * (rows.length + 4)) - 2;
    const range = { start, end: start + Math.floor(random() * rows.length) };
    const pages = index.pagesIn(range).map(({ branch, page }) => `${tree.all.indexOf(branch)}:${page}`);
    expect(pages).toEqual(naivePages(tree, rows, range));
  }
};

describe("view index over a random tree", () => {
  it.each(Array.from({ length: 40 }, (_, seed) => seed + 1))("matches a materialized list (seed %i)", (seed) => {
    const tree = randomTree(seed);
    const random = seededRandom(seed * 31);
    for (const total of PLACEMENTS) expectMatches(tree, total, random);
    for (const [branch, children] of tree.children) {
      for (const ordinal of [...children.keys()].filter(() => random() < 0.4)) {
        branch.collapseChild(ordinal);
        children.delete(ordinal);
      }
      for (const page of [...tree.loaded.get(branch)!].filter(() => random() < 0.3)) {
        branch.deletePage(page);
        tree.loaded.get(branch)!.delete(page);
      }
    }
    for (const total of PLACEMENTS) expectMatches(tree, total, random);
  });

  it("covers expanded children under unloaded pages", () => {
    const gaps = Array.from({ length: 40 }, (_, seed) => randomTree(seed + 1)).flatMap((tree) =>
      [...tree.children].flatMap(([branch, children]) =>
        [...children.keys()].filter((ordinal) => branch.nodeAt(ordinal) === undefined),
      ),
    );
    expect(gaps.length).toBeGreaterThan(10);
  });
});

/**
 * root (10, pages of 4; 0 and 2 loaded): r1 expanded as b1 (6, pages of 2; page 2 loaded), whose t4 is
 * expanded as leaves (3, pages of 2; page 0 loaded); r5, in unloaded page 1, expanded as b5 (2, unloaded).
 * Views 0 r0, 1 r1, 2-5 b1#0-3, 6 t4, 7-9 leaves, 10 t5, 11-14 r2-r5, 15-16 b5, 17-20 r6-r9.
 */
const fixture = (total?: GrandTotalPlacement) => {
  const root = new Branch<Row>([], 10, 4);
  const regions = Array.from({ length: 10 }, () => 6);
  root.setPage(0, nodesOf(root, 0, regions));
  root.setPage(2, nodesOf(root, 2, regions));
  const b1 = new Branch<Row>([step(0, "k1")], 6, 2);
  b1.setPage(2, nodesOf(b1, 2, [0, 0, 0, 0, 3, 3]));
  const leaves = new Branch<Row>([...b1.path, step(1, "k4")], 3, 2);
  leaves.setPage(0, nodesOf(leaves, 0, null));
  const b5 = new Branch<Row>([step(0, "k5")], 2, 2);
  root.expandChild(5, b5);
  root.expandChild(1, b1);
  b1.expandChild(4, leaves);
  const names = new Map<B, string>([[root, "root"], [b1, "b1"], [leaves, "leaves"], [b5, "b5"]]);
  const index = createViewIndex(root, total);
  const pagesIn = (start: number, end: number) =>
    index.pagesIn({ start, end }).map(({ branch, page }) => `${names.get(branch)}:${page}`);
  return { root, b1, leaves, b5, index, pagesIn };
};

describe("pagesIn", () => {
  it("names one page for a range inside it and each page across pages", () => {
    const { pagesIn } = fixture();
    expect(pagesIn(2, 4)).toEqual(["b1:0"]);
    expect(pagesIn(2, 6)).toEqual(["b1:0", "b1:1"]);
  });

  it("walks the branches across a range in view order and skips loaded ordinals", () => {
    const { pagesIn } = fixture();
    expect(pagesIn(5, 16)).toEqual(["b1:1", "leaves:1", "root:1", "b5:0"]);
    expect(pagesIn(13, 19)).toEqual(["root:1", "b5:0"]);
    expect(pagesIn(6, 9)).toEqual([]);
    expect(pagesIn(0, 21)).toEqual(["b1:0", "b1:1", "leaves:1", "root:1", "b5:0"]);
  });

  it("leaves the pages between two disjoint ranges untouched", () => {
    const { pagesIn } = fixture();
    expect([...pagesIn(2, 3), ...pagesIn(15, 17)]).toEqual(["b1:0", "b5:0"]);
  });

  it("clips the range and skips the total row on top and at the bottom", () => {
    expect(fixture().pagesIn(-3, 3)).toEqual(["b1:0"]);
    expect(fixture().pagesIn(5, 5)).toEqual([]);
    const top = fixture("top");
    expect(top.pagesIn(0, 2)).toEqual([]);
    expect(top.pagesIn(3, 5)).toEqual(["b1:0"]);
    const bottom = fixture("bottom");
    expect(bottom.index.totalIndex()).toBe(21);
    expect(bottom.pagesIn(19, 30)).toEqual([]);
    expect(bottom.pagesIn(17, 22)).toEqual(["root:1"]);
  });
});

describe("locate", () => {
  const r1 = step(0, "k1");

  it("finds a loaded group", () => {
    const { index } = fixture("top");
    expect(index.locateGroup([step(0, "k0")])).toBe(1);
    expect(index.locateGroup([r1])).toBe(2);
    expect(index.locateGroup([r1, step(1, "k4")])).toBe(7);
    expect(index.locateGroup([step(0, "k9")])).toBe(21);
  });

  it("answers the parent of a group under an unloaded page, -1 with no located ancestor", () => {
    const { index } = fixture();
    expect(index.locateGroup([r1, step(1, "k0")])).toBe(1);
    expect(index.locateGroup([step(0, "k5")])).toBe(-1);
    expect(index.locateGroup([step(0, "k5"), step(1, "k0")])).toBe(-1);
  });

  it("answers the collapsed ancestor of a hidden group", () => {
    const { root, index } = fixture();
    expect(index.locateGroup([step(0, "k2"), step(1, "k3")])).toBe(11);
    root.collapseChild(1);
    expect(index.locateGroup([r1, step(1, "k4")])).toBe(1);
  });

  it("answers -1 for a missing path and the parent for a missing child", () => {
    const { index } = fixture();
    expect(index.locateGroup([])).toBe(-1);
    expect(index.locateGroup([step(0, "nope")])).toBe(-1);
    expect(index.locateGroup([step(1, "k1")])).toBe(-1);
    expect(index.locateGroup([r1, step(1, "nope")])).toBe(1);
  });

  it("finds a pending id until its branch is dropped, then in the branch that replaces it", () => {
    const { root, b1, leaves, b5, index } = fixture();
    expect(index.locatePending(pendingId(b1.id, 0))).toBe(2);
    expect(index.locatePending(pendingId(root.id, 4))).toBe(13);
    expect(index.locatePending(pendingId(root.id, 0))).toBe(0);
    expect(index.locatePending(pendingId(leaves.id, 2))).toBe(9);
    expect(index.locatePending(pendingId(b5.id, 1))).toBe(16);
    expect(index.locatePending(pendingId(b1.id, 6))).toBe(-1);
    expect(index.locatePending("gp-pending:0@foreign")).toBe(-1);
    expect(index.locatePending(42)).toBe(-1);
    root.collapseChild(1);
    expect(index.locatePending(pendingId(b1.id, 0))).toBe(-1);
    expect(index.locatePending(pendingId(leaves.id, 2))).toBe(-1);
    expect(index.indexOf(leaves, 0)).toBe(-1);
    expect(index.locatePending(pendingId(b5.id, 1))).toBe(7);
    root.expandChild(1, new Branch<Row>(b1.path, 6, 2));
    expect(index.locatePending(pendingId(b1.id, 0))).toBe(2);
  });

  it("finds a registered leaf until its page or branch is dropped", () => {
    const { b1, leaves, index } = fixture();
    const [first, second] = leaves.pages.get(0)!;
    for (const [ordinal, node] of [first!, second!].entries()) index.registerLeaf(node.id, leaves, ordinal);
    expect(index.locateLeaf(first!.id)).toBe(7);
    expect(index.locateLeaf(second!.id)).toBe(8);
    expect(index.locateLeaf("unknown")).toBe(-1);
    index.unregisterLeaves(leaves, 0);
    leaves.deletePage(0);
    expect(index.locateLeaf(first!.id)).toBe(-1);
    leaves.setPage(0, [first!, second!]);
    index.registerLeaf(first!.id, leaves, 0);
    expect(index.locateLeaf(first!.id)).toBe(7);
    leaves.deletePage(0);
    expect(index.locateLeaf(first!.id)).toBe(-1);
    leaves.setPage(0, [first!, second!]);
    expect(b1.collapseChild(4)).toBe(leaves);
    expect(index.locateLeaf(first!.id)).toBe(-1);
  });

  it("keeps a leaf registered again by the branch that replaces its own", () => {
    const { b1, leaves, index } = fixture();
    const nodes = leaves.pages.get(0)!;
    index.registerLeaf(nodes[1]!.id, leaves, 1);
    const again = new Branch<Row>(leaves.path, 3, 2);
    again.setPage(0, nodes);
    b1.expandChild(4, again);
    index.registerLeaf(nodes[1]!.id, again, 1);
    index.unregisterLeaves(leaves, 0);
    expect(index.locateLeaf(nodes[1]!.id)).toBe(8);
  });
});
