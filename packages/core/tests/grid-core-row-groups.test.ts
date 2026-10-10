// PRD 008 D3: `core.rowGroups` over a hand-written hierarchy (AC-008-01).

import { describe, expect, it, vi } from "vitest";
import type { GridInstruction, SetContentSizeInstruction } from "../src/types";
import { createHierarchyFixture, createHierarchyGrid } from "./hierarchy-fixture";

const contentHeight = (batches: readonly GridInstruction[][]): number | undefined =>
  batches
    .flat()
    .filter((i): i is SetContentSizeInstruction => i.type === "SET_CONTENT_SIZE")
    .at(-1)?.height;

const mount = async (grid: ReturnType<typeof createHierarchyGrid>["grid"]) => {
  await grid.initialize();
  grid.setViewport(0, 0, 400, 600);
};

describe("rowGroups — expansion (AC-008-01)", () => {
  it("changes the row count and the content height without a query", async () => {
    const { grid, source, batches } = createHierarchyGrid(() => createHierarchyFixture());
    await mount(grid);
    const queries = source.queries;
    const collapsedHeight = contentHeight(batches)!;
    expect(grid.rows.getCount()).toBe(3);

    expect(grid.rowGroups.setExpanded(["g:IT"], true)).toEqual({ status: "applied" });
    expect(grid.rows.getCount()).toBe(5);
    expect(contentHeight(batches)).toBe(collapsedHeight + 60);

    expect(grid.rowGroups.setExpanded(null, true)).toEqual({ status: "applied" });
    expect(grid.rows.getCount()).toBe(10);

    expect(grid.rowGroups.toggle("g:IT")).toEqual({ status: "applied" });
    expect(grid.rows.getCount()).toBe(5);
    expect(grid.rowGroups.setExpanded(null, false)).toEqual({ status: "applied" });
    expect(grid.rows.getCount()).toBe(3);
    expect(contentHeight(batches)).toBe(collapsedHeight);
    expect(source.queries).toBe(queries);
  });

  it("carries DATA_LOADED, SET_CONTENT_SIZE and the slot instructions in one batch", async () => {
    const { grid, batches } = createHierarchyGrid(() => createHierarchyFixture());
    await mount(grid);
    batches.length = 0;

    grid.rowGroups.setExpanded(["g:IT"], true);

    expect(batches).toHaveLength(1);
    const types = new Set(batches[0].map((i) => i.type));
    expect(types).toContain("DATA_LOADED");
    expect(types).toContain("SET_CONTENT_SIZE");
    expect(types).toContain("ASSIGN_SLOT");
    expect(batches[0].find((i) => i.type === "DATA_LOADED")).toEqual({
      type: "DATA_LOADED", totalRows: 5, hierarchical: true,
    });
  });

  it("refreshes mounted slots whose row index stays in view", async () => {
    const { grid, batches } = createHierarchyGrid(() => createHierarchyFixture());
    await mount(grid);
    batches.length = 0;

    grid.rowGroups.setExpanded(["g:IT"], true);

    // Row 2 showed FR and now shows Rome under the same slot.
    const assigned = batches[0].filter((i) => i.type === "ASSIGN_SLOT");
    expect(assigned.find((i) => i.rowIndex === 2)).toMatchObject({
      row: { kind: "group", id: "g:IT:Rome", depth: 1 },
    });
    expect(grid.cells.getFieldValue(2, "city")).toBe("Rome");
  });
});

describe("rowGroups — statuses", () => {
  it("reports isActive only while a hierarchy is bound", async () => {
    const { grid } = createHierarchyGrid(() => createHierarchyFixture());
    expect(grid.rowGroups.isActive()).toBe(false);
    await grid.initialize();
    expect(grid.rowGroups.isActive()).toBe(true);
  });

  it("answers unchanged for a no-op, a record row, a hidden or an unknown id", async () => {
    const { grid, batches } = createHierarchyGrid(() => createHierarchyFixture());
    await mount(grid);
    batches.length = 0;

    expect(grid.rowGroups.setExpanded(["g:IT"], false)).toEqual({ status: "unchanged" });
    expect(grid.rowGroups.toggle("r1")).toEqual({ status: "unchanged" });
    expect(grid.rowGroups.toggle("g:IT:Rome")).toEqual({ status: "unchanged" });
    expect(grid.rowGroups.toggle("missing")).toEqual({ status: "unchanged" });
    expect(grid.rowGroups.toggle("gp-total")).toEqual({ status: "unchanged" });
    expect(batches).toHaveLength(0);
  });

  it("is unsupported without a hierarchy, without setExpanded, or after destroy", async () => {
    const flat = createHierarchyGrid(() => createHierarchyFixture());
    expect(flat.grid.rowGroups.setExpanded(null, true)).toEqual({ status: "unsupported" });
    expect(flat.grid.rowGroups.toggle("g:IT")).toEqual({ status: "unsupported" });

    const readOnly = createHierarchyGrid(() => createHierarchyFixture({ withoutSetExpanded: true }));
    await readOnly.grid.initialize();
    expect(readOnly.grid.rowGroups.isActive()).toBe(true);
    expect(readOnly.grid.rowGroups.setExpanded(null, true)).toEqual({ status: "unsupported" });
    expect(readOnly.grid.rowGroups.toggle("g:IT")).toEqual({ status: "unsupported" });

    const destroyed = createHierarchyGrid(() => createHierarchyFixture());
    await destroyed.grid.initialize();
    destroyed.grid.destroy();
    expect(destroyed.grid.rowGroups.isActive()).toBe(false);
    expect(destroyed.grid.rowGroups.toggle("g:IT")).toEqual({ status: "unsupported" });
    expect(destroyed.grid.rowGroups.setGrouping(null)).toEqual({ status: "unsupported" });
  });

  it("keeps a source hierarchy through setGrouping(null)", async () => {
    const { grid } = createHierarchyGrid(() => createHierarchyFixture());
    await grid.initialize();
    expect(grid.rowGroups.setGrouping(null)).toEqual({ status: "unchanged" });
    expect(grid.rowGroups.isActive()).toBe(true);
  });
});

describe("rowGroups — onRowGroupToggled", () => {
  it("fires for a gesture and not for a command", async () => {
    const onRowGroupToggled = vi.fn();
    const { grid } = createHierarchyGrid(() => createHierarchyFixture(), { onRowGroupToggled });
    await mount(grid);
    const groups = grid["rowGroupsController"];

    grid.rowGroups.toggle("g:IT");
    grid.rowGroups.setExpanded(null, false);
    expect(onRowGroupToggled).not.toHaveBeenCalled();

    expect(groups.toggleAt(1)).toEqual({ status: "applied" });
    expect(onRowGroupToggled).toHaveBeenCalledExactlyOnceWith({ rowId: "g:IT", expanded: true });
    expect(groups.toggleAt(1)).toEqual({ status: "applied" });
    expect(onRowGroupToggled).toHaveBeenLastCalledWith({ rowId: "g:IT", expanded: false });

    // The total row and a missing row toggle nothing.
    expect(groups.toggleAt(0)).toEqual({ status: "unchanged" });
    expect(groups.toggleAt(99)).toEqual({ status: "unchanged" });
    expect(onRowGroupToggled).toHaveBeenCalledTimes(2);
  });
});
