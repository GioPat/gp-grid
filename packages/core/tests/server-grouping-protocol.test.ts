// PRD 009 D1 (AC-009-06): the protocol checks a response passes before it touches a branch.

import { describe, expect, it } from "vitest";
import { checkChildren, checkLeaves } from "../src/server-grouping/protocol";
import type {
  CellValue,
  ServerGroupChildrenRequest,
  ServerGroupChildrenResponse,
  ServerGroupNode,
  ServerLeavesRequest,
  ServerLeavesResponse,
} from "../src/types";
import { GROUPING } from "./server-grouping-oracle";

const node = (key: CellValue): ServerGroupNode => ({ key, childCount: 1, leafCount: 1 });

const nodes = (count: number): ServerGroupNode[] => Array.from({ length: count }, (_, at) => node(`k${at}`));

const childrenRequest = (startRow: number, endRow: number, revision: number | null = 3): ServerGroupChildrenRequest => ({
  revision,
  grouping: GROUPING,
  path: [["region", "s", "north"]],
  range: { startRow, endRow },
});

const childrenResponse = (
  totalCount: number,
  children: ServerGroupNode[],
  revision = 3,
): ServerGroupChildrenResponse => ({ revision, totalCount, children });

const leavesRequest = (startRow: number, endRow: number): ServerLeavesRequest => ({
  revision: 3,
  grouping: GROUPING,
  path: [["region", "s", "north"], ["t", "s", "a"]],
  range: { startRow, endRow },
});

const leavesResponse = (totalCount: number, count: number, revision = 3): ServerLeavesResponse<{ id: number }> => ({
  revision,
  totalCount,
  rows: Array.from({ length: count }, (_, id) => ({ id })),
});

describe("server grouping protocol — group children (D1)", () => {
  it("accepts a full page, the clipped last page and an empty branch", () => {
    expect(checkChildren(childrenRequest(0, 10), childrenResponse(25, nodes(10)), 25)).toBeNull();
    expect(checkChildren(childrenRequest(20, 25), childrenResponse(25, nodes(5)), 25)).toBeNull();
    expect(checkChildren(childrenRequest(20, 30), childrenResponse(25, nodes(5)), 25)).toBeNull();
    expect(checkChildren(childrenRequest(0, 10), childrenResponse(0, []), 0)).toBeNull();
  });

  it("rejects a revision other than the view's", () => {
    expect(checkChildren(childrenRequest(0, 10), childrenResponse(25, nodes(10), 2), 25)).toBe(
      "Stale revision 2, expected 3",
    );
  });

  it.each([-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects a totalCount of %s", (totalCount) => {
    expect(checkChildren(childrenRequest(0, 10), childrenResponse(totalCount, nodes(10)), 25)).toBe(
      `Invalid totalCount: ${totalCount}`,
    );
  });

  it("rejects a totalCount other than the one the parent declared", () => {
    expect(checkChildren(childrenRequest(0, 10), childrenResponse(26, nodes(10)), 25)).toBe(
      "totalCount 26 differs from the declared 25",
    );
  });

  it("rejects a page longer than its range, or than the range clipped to the count", () => {
    expect(checkChildren(childrenRequest(0, 10), childrenResponse(25, nodes(11)), 25)).toBe(
      "Page too long: 11 children for 10",
    );
    expect(checkChildren(childrenRequest(20, 30), childrenResponse(25, nodes(6)), 25)).toBe(
      "Page too long: 6 children for 5",
    );
  });

  it("rejects a page shorter than the range clipped to the count", () => {
    expect(checkChildren(childrenRequest(0, 10), childrenResponse(25, nodes(9)), 25)).toBe(
      "Page too short: 9 children for 10",
    );
    expect(checkChildren(childrenRequest(20, 30), childrenResponse(25, nodes(4)), 25)).toBe(
      "Page too short: 4 children for 5",
    );
  });

  it("rejects a key that is an object other than a Date, naming its ordinal", () => {
    const children = [node("a"), node({ region: "north" }), node("c")];
    expect(checkChildren(childrenRequest(10, 13), childrenResponse(13, children), 13)).toBe(
      "Invalid group key at child 11",
    );
    expect(checkChildren(childrenRequest(0, 1), childrenResponse(1, [node(["north"])]), 1)).toBe(
      "Invalid group key at child 0",
    );
    const scalars = [node(null), node(new Date(0)), node(0), node(false), node("")];
    expect(checkChildren(childrenRequest(0, 5), childrenResponse(5, scalars), 5)).toBeNull();
  });

  it("exempts the root request of a new view: any revision and any count", () => {
    const root = childrenRequest(0, 100, null);
    expect(checkChildren(root, childrenResponse(7, nodes(7), 41), null)).toBeNull();
    expect(checkChildren(root, childrenResponse(250, nodes(100), 0), null)).toBeNull();
  });

  it("still checks the root response's own count, page and keys", () => {
    const root = childrenRequest(0, 100, null);
    expect(checkChildren(root, childrenResponse(-1, []), null)).toBe("Invalid totalCount: -1");
    expect(checkChildren(root, childrenResponse(8, nodes(7)), null)).toBe("Page too short: 7 children for 8");
    expect(checkChildren(root, childrenResponse(1, [node({})]), null)).toBe("Invalid group key at child 0");
  });

  it("reports the revision before the count and the count before the page", () => {
    expect(checkChildren(childrenRequest(0, 10), childrenResponse(26, nodes(3), 9), 25)).toMatch(/^Stale revision/);
    expect(checkChildren(childrenRequest(0, 10), childrenResponse(26, nodes(3)), 25)).toMatch(/differs/);
  });
});

describe("server grouping protocol — leaf pages (D1)", () => {
  it("accepts a full page and the clipped last page", () => {
    expect(checkLeaves(leavesRequest(0, 10), leavesResponse(25, 10), 25)).toBeNull();
    expect(checkLeaves(leavesRequest(20, 25), leavesResponse(25, 5), 25)).toBeNull();
  });

  it("rejects a stale revision, a bad or changed count, and a long or short page", () => {
    expect(checkLeaves(leavesRequest(0, 10), leavesResponse(25, 10, 4), 25)).toBe("Stale revision 4, expected 3");
    expect(checkLeaves(leavesRequest(0, 10), leavesResponse(-3, 10), 25)).toBe("Invalid totalCount: -3");
    expect(checkLeaves(leavesRequest(0, 10), leavesResponse(24, 10), 25)).toBe(
      "totalCount 24 differs from the declared 25",
    );
    expect(checkLeaves(leavesRequest(0, 10), leavesResponse(25, 11), 25)).toBe("Page too long: 11 rows for 10");
    expect(checkLeaves(leavesRequest(20, 25), leavesResponse(25, 4), 25)).toBe("Page too short: 4 rows for 5");
  });
});
