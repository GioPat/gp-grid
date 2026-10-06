import { describe, expect, it } from "vitest";
import { buildGroupTree, type GroupTree } from "../src/row-grouping/group-tree";
import {
  createExpansion,
  createVisibleRows,
  type GrandTotalPlacement,
  type VisibleRows,
} from "../src/row-grouping/visible-rows";
import type { CellValue } from "../src/types";
import { objectSource, seededRandom } from "./row-grouping-source";

type Entry = { kind: "total" } | { kind: "group"; group: number } | { kind: "leaf"; group: number; offset: number; position: number };

// Pre-order: 0 FR, 1 Lyon, 2 Paris, 3 IT, 4 Milan, 5 Rome, 6 null, 7 Nowhere.
const ROWS = [
  { country: "IT", city: "Rome" },
  { country: "FR", city: "Paris" },
  { country: "IT", city: "Milan" },
  { country: null, city: "Nowhere" },
  { country: "IT", city: "Rome" },
  { country: "FR", city: "Lyon" },
  { city: "Nowhere" },
];

const buildTree = (rows: Record<string, CellValue | undefined>[], fields: string[]) =>
  buildGroupTree(
    objectSource(rows),
    fields.map((field) => ({ field })),
  ) as GroupTree;

const childrenOf = (tree: GroupTree, group: number) => {
  const children: number[] = [];
  for (let child = group + 1; child < tree.end[group]!; child = tree.end[child]!) children.push(child);
  return children;
};

const roots = (tree: GroupTree) => {
  const out: number[] = [];
  for (let group = 0; group < tree.groupCount; group = tree.end[group]!) out.push(group);
  return out;
};

/** The view rows written out one by one: the reference. */
const materialize = (tree: GroupTree, expanded: Uint8Array, total?: GrandTotalPlacement): Entry[] => {
  const out: Entry[] = [];
  const terminal = tree.dimensions.length - 1;
  const visit = (group: number) => {
    out.push({ kind: "group", group });
    if (expanded[group] !== 1) return;
    if (tree.depth[group] !== terminal) return childrenOf(tree, group).forEach(visit);
    for (let offset = 0; offset < tree.leafEnd[group]! - tree.leafStart[group]!; offset++) {
      out.push({ kind: "leaf", group, offset, position: tree.leafOrder[tree.leafStart[group]! + offset]! });
    }
  };
  roots(tree).forEach(visit);
  if (total === "top") out.unshift({ kind: "total" });
  if (total === "bottom") out.push({ kind: "total" });
  return out;
};

const readAt = (rows: VisibleRows, view: number): Entry | undefined => {
  if (view >= 0 && rows.totalIndex === view) return { kind: "total" };
  const group = rows.groupAt(view);
  if (group >= 0) return { kind: "group", group };
  const position = rows.leafAt(view);
  if (position < 0) return undefined;
  return { kind: "leaf", group: rows.leafGroupAt(view), offset: -1, position };
};

const expectMatches = (tree: GroupTree, rows: VisibleRows, expanded: Uint8Array, total?: GrandTotalPlacement) => {
  const expected = materialize(tree, expanded, total);
  expect(rows.rowCount).toBe(expected.length);
  const forward = expected.map((_, view) => readAt(rows, view));
  const backward = expected.map((_, view) => readAt(rows, expected.length - 1 - view)).reverse();
  const comparable = expected.map((entry) => (entry.kind === "leaf" ? { ...entry, offset: -1 } : entry));
  expect(forward).toEqual(comparable);
  expect(backward).toEqual(comparable);
  expect(readAt(rows, -1)).toBeUndefined();
  expect(readAt(rows, expected.length)).toBeUndefined();
  expected.forEach((entry, view) => {
    if (entry.kind === "group") expect(rows.viewIndexOfGroup(entry.group)).toBe(view);
    if (entry.kind === "leaf") expect(rows.viewIndexOfLeaf(entry.group, entry.offset)).toBe(view);
  });
  const visible = new Set(expected.flatMap((entry) => (entry.kind === "group" ? [entry.group] : [])));
  for (let group = 0; group < tree.groupCount; group++) {
    if (!visible.has(group)) expect(rows.viewIndexOfGroup(group)).toBe(-1);
  }
};

describe("visible rows", () => {
  const tree = buildTree(ROWS, ["country", "city"]);

  it("lists only the top groups while collapsed", () => {
    const expanded = createExpansion(tree, 0);
    const rows = createVisibleRows(tree, expanded);
    expect(rows.rowCount).toBe(3);
    expect([0, 1, 2].map((view) => rows.groupAt(view))).toEqual([0, 3, 6]);
    expect(rows.totalIndex).toBe(-1);
    expectMatches(tree, rows, expanded);
  });

  it("runs the leaves of an expanded terminal group after its row", () => {
    const expanded = createExpansion(tree, 0);
    expanded[3] = 1;
    expanded[5] = 1;
    const rows = createVisibleRows(tree, expanded, "top");
    expect(rows.rowCount).toBe(8);
    expect(rows.groupAt(4)).toBe(5);
    expect([5, 6].map((view) => rows.leafAt(view))).toEqual([0, 4]);
    expect(rows.viewIndexOfLeaf(4, 0)).toBe(-1);
    expectMatches(tree, rows, expanded, "top");
  });

  it("lists every group and leaf when fully expanded, the total at the bottom", () => {
    const expanded = createExpansion(tree, 2);
    const rows = createVisibleRows(tree, expanded, "bottom");
    expect(rows.rowCount).toBe(8 + 7 + 1);
    expect(rows.totalIndex).toBe(15);
    expectMatches(tree, rows, expanded, "bottom");
  });

  it("rebuilds after a toggle without touching leafOrder", () => {
    const expanded = createExpansion(tree, 1);
    const rows = createVisibleRows(tree, expanded, "top");
    const leafOrder = tree.leafOrder;
    const before = Array.from(leafOrder);
    expanded[0] = 0;
    expanded[4] = 1;
    rows.rebuild();
    expect(tree.leafOrder).toBe(leafOrder);
    expect(Array.from(tree.leafOrder)).toEqual(before);
    expectMatches(tree, rows, expanded, "top");
  });

  it("answers an empty tree with the total row only", () => {
    const empty = buildTree([], ["country"]);
    const rows = createVisibleRows(empty, createExpansion(empty, 1), "top");
    expect(rows.rowCount).toBe(1);
    expect(rows.groupAt(0)).toBe(-1);
  });

  it("matches a materialized list over randomized trees and expansion", () => {
    const random = seededRandom(11);
    const placements: (GrandTotalPlacement | undefined)[] = ["top", "bottom", undefined];
    for (let run = 0; run < 30; run++) {
      const rows = Array.from({ length: 1 + Math.floor(random() * 120) }, () => ({
        a: Math.floor(random() * 4),
        b: Math.floor(random() * 3),
        c: Math.floor(random() * 5),
      }));
      const randomTree = buildTree(rows, ["a", "b", "c"].slice(0, 1 + (run % 3)));
      const expanded = randomTree.depth.map(() => (random() < 0.6 ? 1 : 0));
      const total = placements[run % 3];
      const visible = createVisibleRows(randomTree, expanded, total);
      expectMatches(randomTree, visible, expanded, total);
      expanded[Math.floor(random() * randomTree.groupCount)]! ^= 1;
      visible.rebuild();
      expectMatches(randomTree, visible, expanded, total);
    }
  });
});
