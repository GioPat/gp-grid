import { describe, expect, it } from "vitest";
import type { CellValue, GroupPathStep, SortModel } from "../src/types";
import { createMockGroupingService, type MockCorruption, type MockRequestKind } from "./server-grouping-mock";
import {
  GROUPING,
  TAG_NAMES,
  childrenRequest,
  inPath,
  leavesRequest,
  makeSales,
  naiveAggregates,
  naiveChildren,
  naiveLeaves,
  naiveSteps,
  terminalPaths,
  valuesFilter,
  type Sale,
} from "./server-grouping-oracle";

const isBlank = (value: unknown) => value === null || value === undefined || value === "";

const identity = (value: unknown) => (value instanceof Date ? `date:${value.getTime()}` : value);

const isSelected = (value: unknown, values: CellValue[]) => values.map(identity).includes(identity(value));

const serviceOver = (rows: readonly Sale[], revision?: number) =>
  createMockGroupingService(rows, { getRowId: (row) => row.id, revision });

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const rows = makeSales(11, 240);
const firstRoot = naiveSteps(rows, [])[0]!;
const fullPath = terminalPaths(rows).find((path) => inPath(rows, path).length >= 4)!;

describe("server grouping mock service", () => {
  it("groups the root in the local engine's key order, with counts, aggregates and totals", async () => {
    expect(new Set(naiveSteps(rows, []).map((step) => step[1]))).toEqual(new Set(TAG_NAMES));
    const expected = naiveChildren(rows, []);
    await expect(serviceOver(rows).fetchChildren(childrenRequest([]))).resolves.toEqual({
      revision: 1,
      totalCount: expected.length,
      children: expected,
      totals: naiveAggregates(rows),
    });
  });

  it("answers every mid path with its terminal groups and no totals", async () => {
    const service = serviceOver(rows);
    for (const root of naiveSteps(rows, [])) {
      const response = await service.fetchChildren(childrenRequest([root]));
      const expected = naiveChildren(rows, [root]);
      expect(response).toEqual({ revision: 1, totalCount: expected.length, children: expected });
      expect(response).not.toHaveProperty("totals");
    }
  });

  it("returns a terminal group's leaves in the request's sort, paged by range", async () => {
    const service = serviceOver(rows);
    const sort: SortModel[] = [{ colId: "amount", direction: "desc" }, { colId: "score", direction: "asc" }];
    for (const path of terminalPaths(rows)) {
      const expected = naiveLeaves(rows, path, sort);
      const all = await service.fetchLeaves(leavesRequest(path, { sort }));
      expect(all).toEqual({ revision: 1, totalCount: expected.length, rows: expected });
      const page = await service.fetchLeaves(leavesRequest(path, { sort, range: { startRow: 1, endRow: 3 } }));
      expect(page).toEqual({ revision: 1, totalCount: expected.length, rows: expected.slice(1, 3) });
    }
  });

  it("pages a half-open range clipped to the exact count", async () => {
    const service = serviceOver(rows);
    const expected = naiveChildren(rows, []);
    const count = expected.length;
    for (const [startRow, endRow] of [[0, 2], [2, 5], [count - 1, count + 5], [count + 2, count + 9]] as const) {
      const response = await service.fetchChildren(childrenRequest([], { range: { startRow, endRow } }));
      expect(response.totalCount).toBe(count);
      expect(response.children).toEqual(expected.slice(startRow, endRow));
    }
  });

  it("applies values-mode filters before grouping, totals and leaves", async () => {
    const regions: CellValue[] = ["north", 3, new Date(1000), false];
    const teams: CellValue[] = ["a", 0, false, new Date(0)];
    const filter = { region: valuesFilter(regions, true), team: valuesFilter(teams, false) };
    const kept = rows.filter(
      (row) => (isBlank(row.region) || isSelected(row.region, regions)) && isSelected(row.team, teams),
    );
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(rows.length);
    const service = serviceOver(rows);
    const expected = naiveChildren(kept, []);
    await expect(service.fetchChildren(childrenRequest([], { filter }))).resolves.toEqual({
      revision: 1,
      totalCount: expected.length,
      children: expected,
      totals: naiveAggregates(kept),
    });
    for (const path of terminalPaths(kept)) {
      const response = await service.fetchLeaves(leavesRequest(path, { filter }));
      expect(response.rows).toEqual(naiveLeaves(kept, path));
    }
  });

  it("reverses a dimension's key order only where its field sorts descending", async () => {
    const service = serviceOver(rows);
    const sort: SortModel[] = [{ colId: "region", direction: "desc" }];
    const root = await service.fetchChildren(childrenRequest([], { sort }));
    expect(root.children).toEqual(naiveChildren(rows, [], -1));
    expect(root.children[0]?.key).toBeNull();
    const mid = await service.fetchChildren(childrenRequest([firstRoot], { sort }));
    expect(mid.children).toEqual(naiveChildren(rows, [firstRoot]));
  });

  it("buckets null with undefined, keys a date by its timestamp and a non-finite number as text", async () => {
    const odd: Sale[] = [
      { id: 1, region: null, team: "a" },
      { id: 2, region: undefined, team: "a" },
      { id: 3, region: new Date(42), team: "a" },
      { id: 4, region: Infinity, team: "a" },
    ];
    const service = serviceOver(odd);
    const root = await service.fetchChildren(childrenRequest([]));
    expect(root.children.map((node) => [node.key, node.leafCount])).toEqual([[Infinity, 1], [new Date(42), 1], [null, 2]]);
    const leafIds = async (step: GroupPathStep) =>
      (await service.fetchLeaves(leavesRequest([step, ["t", "s", "a"]]))).rows.map((row) => row.id);
    expect(await leafIds(["region", "d", 42])).toEqual([3]);
    expect(await leafIds(["region", "n", "Infinity"])).toEqual([4]);
    expect(await leafIds(["region", "z", null])).toEqual([1, 2]);
  });

  it("rejects an unknown aggregate, a path too deep, a foreign dimension and a repeated id", async () => {
    const service = serviceOver(rows);
    const median = { ...GROUPING, measures: [{ field: "amount", aggregate: "median" }] };
    await expect(service.fetchChildren(childrenRequest([], { grouping: median }))).rejects.toThrow(RangeError);
    await expect(service.fetchChildren(childrenRequest(fullPath))).rejects.toThrow(RangeError);
    await expect(service.fetchLeaves(leavesRequest([["team", "s", "a"]]))).rejects.toThrow(RangeError);
    expect(() => serviceOver([rows[0]!, rows[0]!])).toThrow(RangeError);
  });

  it("echoes its current revision whatever revision a request carries", async () => {
    const service = serviceOver(rows, 5);
    expect((await service.fetchChildren(childrenRequest([]))).revision).toBe(5);
    expect((await service.fetchChildren(childrenRequest([firstRoot], { revision: 2 }))).revision).toBe(5);
    expect(service.bumpRevision()).toBe(6);
    expect(service.revision).toBe(6);
    expect((await service.fetchLeaves(leavesRequest(fullPath, { revision: 5 }))).revision).toBe(6);
  });
});

describe("server grouping mock controls", () => {
  it("holds responses until release settles them in arrival order, and keeps holding", async () => {
    const service = serviceOver(rows);
    service.hold();
    const settled: string[] = [];
    const track = (label: string, response: Promise<unknown>) => response.then(() => settled.push(label));
    track("root", service.fetchChildren(childrenRequest([])));
    track("mid", service.fetchChildren(childrenRequest([firstRoot])));
    track("leaves", service.fetchLeaves(leavesRequest(fullPath)));
    await flush();
    expect(settled).toEqual([]);
    service.release(2);
    await flush();
    expect(settled).toEqual(["root", "mid"]);
    track("late", service.fetchChildren(childrenRequest([])));
    await flush();
    expect(settled).toEqual(["root", "mid"]);
    service.release();
    await flush();
    expect(settled).toEqual(["root", "mid", "leaves", "late"]);
  });

  it("builds a held response when released, with the revision of that moment", async () => {
    const service = serviceOver(rows);
    service.hold();
    const response = service.fetchChildren(childrenRequest([]));
    service.bumpRevision();
    service.release();
    expect((await response).revision).toBe(2);
  });

  it("fails only the next request of the named kind", async () => {
    const service = serviceOver(rows);
    service.failNext("leaves");
    await expect(service.fetchChildren(childrenRequest([]))).resolves.toHaveProperty("revision", 1);
    await expect(service.fetchLeaves(leavesRequest(fullPath))).rejects.toThrow("mock failure");
    await expect(service.fetchLeaves(leavesRequest(fullPath))).resolves.toHaveProperty("revision", 1);
    service.failNext("children");
    await expect(service.fetchChildren(childrenRequest([]))).rejects.toThrow("mock failure");
    expect(service.requests.map((entry) => entry.kind)).toEqual(["children", "leaves", "leaves", "children"]);
  });

  it("corrupts the next children response once, in each mode", async () => {
    const service = serviceOver(rows);
    const range = { startRow: 1, endRow: 4 };
    const fetch = () => service.fetchChildren(childrenRequest([], { range }));
    const corrupted = (how: MockCorruption) => {
      service.corruptNext("children", how);
      return fetch();
    };
    const base = await fetch();
    expect(base.children).toHaveLength(3);
    expect(await corrupted("stale-revision")).toEqual({ ...base, revision: 0 });
    expect(await corrupted("wrong-count")).toEqual({ ...base, totalCount: base.totalCount + 1 });
    expect((await corrupted("long-page")).children).toEqual(naiveChildren(rows, []).slice(1, 5));
    expect((await corrupted("short-page")).children).toEqual(base.children.slice(0, 2));
    const objectKey = await corrupted("object-key");
    expect(objectKey.children[0]?.key).toEqual({ mock: "object-key" });
    expect(objectKey.children.slice(1)).toEqual(base.children.slice(1));
    expect(await fetch()).toEqual(base);
  });

  it("repeats the last node for a long page at the end of the count", async () => {
    const service = serviceOver(rows);
    const expected = naiveChildren(rows, []);
    service.corruptNext("children", "long-page");
    const range = { startRow: expected.length - 2, endRow: expected.length + 3 };
    const response = await service.fetchChildren(childrenRequest([], { range }));
    expect(response.children).toEqual([...expected.slice(-2), expected.at(-1)]);
  });

  it("corrupts the next leaves response once, and has no object key to corrupt there", async () => {
    const service = serviceOver(rows);
    const fetch = () => service.fetchLeaves(leavesRequest(fullPath, { range: { startRow: 0, endRow: 3 } }));
    const corrupted = (how: Exclude<MockCorruption, "object-key">) => {
      service.corruptNext("leaves", how);
      return fetch();
    };
    const expected = naiveLeaves(rows, fullPath);
    const base = await fetch();
    expect(base.rows).toEqual(expected.slice(0, 3));
    expect(await corrupted("stale-revision")).toEqual({ ...base, revision: 0 });
    expect(await corrupted("wrong-count")).toEqual({ ...base, totalCount: base.totalCount + 1 });
    expect((await corrupted("long-page")).rows).toEqual(expected.slice(0, 4));
    expect((await corrupted("short-page")).rows).toEqual(expected.slice(0, 2));
    const untyped = service.corruptNext as (kind: MockRequestKind, how: MockCorruption) => void;
    expect(() => untyped("leaves", "object-key")).toThrow(RangeError);
    expect(await fetch()).toEqual(base);
  });

  it("logs every request with its signal's aborted state when its response settled", async () => {
    const service = serviceOver(rows);
    service.hold();
    const first = new AbortController();
    const second = new AbortController();
    const a = childrenRequest([], { signal: first.signal });
    const b = leavesRequest(fullPath, { signal: second.signal });
    const c = childrenRequest([firstRoot]);
    void service.fetchChildren(a);
    void service.fetchLeaves(b);
    void service.fetchChildren(c);
    first.abort();
    expect(service.requests.map((entry) => entry.aborted)).toEqual([false, false, false]);
    service.release();
    await flush();
    second.abort();
    expect(service.requests.map(({ kind, request, aborted }) => [kind, request, aborted])).toEqual([
      ["children", a, true],
      ["leaves", b, false],
      ["children", c, false],
    ]);
  });
});
