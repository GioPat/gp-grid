// PRD 009 D4/D8: the changes a self-loading hierarchy notifies, through GridCore.

import { describe, expect, it, vi } from "vitest";
import type { GridInstruction, HierarchyChange, RowId, ScrollToInstruction } from "../src/types";
import { createHierarchyGrid, createHierarchySource } from "./hierarchy-fixture";
import { createLazyHierarchyFixture, mountLazyGrid, mountedRows } from "./lazy-hierarchy-fixture";

// Fully expanded: 0 total, 1 g:IT, 2 g:IT:Rome, 3 r1, 4 r2, 5 g:IT:Milan,
// 6 r3, 7 g:FR, 8 g:FR:Paris, 9 r4; every leaf a placeholder at first.
const ALL = ["g:IT", "g:IT:Rome", "g:IT:Milan", "g:FR", "g:FR:Paris"];

const lazy = () => createLazyHierarchyFixture({ expanded: ALL });

const types = (batches: readonly GridInstruction[][]) => batches.flat().map((i) => i.type);

const scrolls = (batches: readonly GridInstruction[][]): number[] =>
  batches
    .flat()
    .filter((i): i is ScrollToInstruction => i.type === "SCROLL_TO")
    .map((i) => i.scrollTop);

const heightOf = (grid: Awaited<ReturnType<typeof mountLazyGrid>>["grid"], viewIndex: number) => {
  const bounds = grid.geometry.getRowBounds(viewIndex, "content");
  return bounds === undefined ? 0 : bounds.end - bounds.start;
};

describe("hierarchy notify — rows (D4)", () => {
  it("re-plans the slots whose placeholders loaded, in one batch and without DATA_LOADED", async () => {
    const access = lazy();
    const { grid, batches } = await mountLazyGrid(access, { freezeRows: { count: 4 } }, 300);
    const count = grid.rows.getCount();
    const before = batches.length;

    access.load({ start: 3, end: 5 });

    const after = batches.slice(before);
    expect(after).toHaveLength(1);
    expect(types(after)).not.toContain("DATA_LOADED");
    expect(types(after)).not.toContain("DATA_LOADING");
    const mounted = mountedRows(batches);
    expect(mounted.get(3)?.loading).toBeUndefined();
    expect(mounted.get(3)?.row).toMatchObject({ kind: "record", id: "r1" });
    expect(mounted.get(4)?.row).toMatchObject({ kind: "record", id: "r2" });
    expect(mounted.get(6)?.loading).toBe(true);
    expect(grid.rows.getCount()).toBe(count);
  });

  it("places a height set by id on a row that was a placeholder", async () => {
    const access = lazy();
    const { grid, batches } = await mountLazyGrid(access, {}, 300);
    grid.rowHeights.set([{ rowId: "r1", height: 60 }]);
    expect(heightOf(grid, 3)).toBe(30);

    access.load({ start: 3, end: 4 });

    expect(heightOf(grid, 3)).toBe(60);
    expect(heightOf(grid, 4)).toBe(30);
    const slot = mountedRows(batches).get(3);
    expect(slot?.row).toMatchObject({ kind: "record", id: "r1" });
    expect(slot?.rowData).toMatchObject({ id: "r1" });
    expect(slot?.loading).toBeUndefined();
  });
});

describe("hierarchy notify — view and error (D4)", () => {
  it("keeps the anchor and the active cell by id when rows above them go, capturing before apply()", async () => {
    const access = lazy();
    const { grid, batches } = await mountLazyGrid(access);
    grid.setViewport(160, 0, 400, 120);
    grid.selection.setActiveCell(8, 1);
    const seen: [RowId, number][] = [];
    const getRowId = access.getRowId;
    access.getRowId = (viewRow) => {
      const id = getRowId(viewRow);
      seen.push([id, access.applyCount]);
      return id;
    };
    const requests = access.requests.length;
    batches.length = 0;

    // Rome collapses inside apply(): Milan moves from row 5 to row 3, Paris from row 8 to row 6.
    access.fail("g:IT:Rome");

    expect(access.applyCount).toBe(1);
    const beforeApply = seen.filter(([, applied]) => applied === 0).map(([id]) => id);
    expect(beforeApply).toEqual(expect.arrayContaining(["g:IT:Milan", "g:FR:Paris"]));
    expect(batches).toHaveLength(1);
    expect(types(batches)).toContain("DATA_LOADED");
    expect(scrolls(batches).at(-1)).toBe(100);
    expect(grid.selection.getActiveCell()).toEqual({ row: 6, col: 1 });
    expect(grid.rows.getViewRow(2)).toMatchObject({ kind: "group", expanded: false, error: "boom" });
    expect(access.requests.length).toBe(requests + 1);
  });

  it("emits DATA_ERROR for an error change", async () => {
    const access = lazy();
    const { batches } = await mountLazyGrid(access);
    batches.length = 0;
    access.rootFail("root page failed");
    expect(batches.flat()).toEqual([{ type: "DATA_ERROR", error: "root page failed" }]);
  });
});

describe("hierarchy notify — subscription (D4, D8)", () => {
  it("handles no notification after destroy() but still applies a pending view", async () => {
    const access = lazy();
    const subscribe = vi.spyOn(access, "subscribe");
    const { grid } = await mountLazyGrid(access);
    const listener = subscribe.mock.calls[0]![0] as (change: HierarchyChange) => void;

    grid.destroy();
    expect(access.listenerCount()).toBe(0);
    const late: GridInstruction[][] = [];
    grid.onBatchInstruction((batch) => late.push(batch));
    const apply = vi.fn();
    const changes: HierarchyChange[] = [
      { kind: "rows", start: 0, end: 2 },
      { kind: "view", apply },
      { kind: "error", message: "late" },
    ];
    for (const change of changes) listener(change);
    expect(late).toEqual([]);
    expect(apply).toHaveBeenCalledOnce();
  });

  it("unsubscribes the old hierarchy on setDataSource", async () => {
    const first = lazy();
    const second = createLazyHierarchyFixture();
    const { grid, batches } = createHierarchyGrid(() => first);
    await grid.initialize();
    expect(first.listenerCount()).toBe(1);

    await grid.setDataSource(createHierarchySource(() => second));
    expect(first.listenerCount()).toBe(0);
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(second.listenerCount()).toBe(1);

    batches.length = 0;
    first.rootFail();
    first.fail("g:IT");
    expect(batches).toHaveLength(0);
    expect(first.applyCount).toBe(1);
  });
});
