// PRD 009 D2/D6: a hierarchy row without a `getRow` answer is a placeholder.

import { describe, expect, it } from "vitest";
import { RowStore } from "../src/managers/row-store";
import type { DataSource, RowAccess } from "../src/types";
import { fixtureColumns, type FixtureRecord } from "./hierarchy-fixture";
import { createLazyHierarchyFixture } from "./lazy-hierarchy-fixture";

// Fully expanded: 0 total, 1 g:IT, 2 g:IT:Rome, 3 r1, 4 r2, 5 g:IT:Milan,
// 6 r3, 7 g:FR, 8 g:FR:Paris, 9 r4; every leaf a placeholder at first.
const ALL = ["g:IT", "g:IT:Rome", "g:IT:Milan", "g:FR", "g:FR:Paris"];
const R1_PENDING = "gp-pending:0@g:IT:Rome";

const source: DataSource<FixtureRecord> = { query: async () => ({ rows: [], totalRows: 0 }) };

const createStore = () =>
  new RowStore<FixtureRecord>({
    getColumns: () => fixtureColumns,
    getDataSource: () => source,
    isWritable: () => true,
  });

const lazyStore = () => {
  const store = createStore();
  const access = createLazyHierarchyFixture({ expanded: ALL });
  store.bindHierarchy(access);
  return { store, access };
};

describe("row store — placeholders", () => {
  it("has an id but no row, record, value or write", () => {
    const { store } = lazyStore();
    expect(store.hasRow(3)).toBe(false);
    expect(store.getRowId(3)).toBe(R1_PENDING);
    expect(store.getHierarchyRow(3)).toBeUndefined();
    expect(store.getRowData(3)).toBeUndefined();
    expect(store.isRowWritable(3)).toBe(false);
    expect(store.getFieldValue(3, "amount")).toBeNull();
  });

  it("keeps group and total rows resident beside them", () => {
    const { store } = lazyStore();
    expect([0, 1, 2].map((row) => store.hasRow(row))).toEqual([true, true, true]);
    expect(store.getFieldValue(2, "amount")).toBe(30);
    expect(store.hasRow(-1)).toBe(false);
    expect(store.hasRow(10)).toBe(false);
    expect(store.getRowId(10)).toBeUndefined();
  });

  it("turns a placeholder into its record once loaded", () => {
    const { store, access } = lazyStore();
    access.load({ start: 3, end: 4 });
    expect(store.hasRow(3)).toBe(true);
    expect(store.getRowId(3)).toBe("r1");
    expect(store.getRowData(3)).toMatchObject({ id: "r1", amount: 10 });
    expect(store.isRowWritable(3)).toBe(true);
    expect(store.hasRow(4)).toBe(false);
  });

  it("locates a pending id, and a record id only once its row is loaded", () => {
    const { store, access } = lazyStore();
    expect(store.locateIds(new Set([R1_PENDING, "r1"]))).toEqual(new Map([[R1_PENDING, 3]]));

    access.load({ start: 3, end: 4 });
    expect(store.locateIds(new Set([R1_PENDING, "r1"]))).toEqual(new Map([["r1", 3]]));
  });

  it("finds a record by id once its row is loaded, never a group's or a placeholder's", () => {
    const { store, access } = lazyStore();
    access.load({ start: 3, end: 4 });
    expect(store.getRecordById("r1")).toMatchObject({ id: "r1", amount: 10 });
    expect(store.getRecordById("r2")).toBeUndefined();
    expect(store.getRecordById("g:IT:Rome")).toBeUndefined();
    expect(store.getRecordById(R1_PENDING)).toBeUndefined();
  });
});

describe("row store — flat rows are unchanged", () => {
  it("answers a cached row and nothing for a gap", () => {
    const store = createStore();
    store.getCachedRows().set(0, { id: "a", country: "IT", city: "Rome", amount: 1 });
    expect(store.hasRow(0)).toBe(true);
    expect(store.hasRow(1)).toBe(false);
    expect(store.isRowWritable(1)).toBe(true);
  });

  it("answers every index of a scalar access", () => {
    const store = createStore();
    const access: RowAccess = { rowCount: 2, getValue: () => null };
    store.setRowAccess(access);
    expect([-1, 0, 1, 2].map((row) => store.hasRow(row))).toEqual([false, true, true, false]);
  });
});
