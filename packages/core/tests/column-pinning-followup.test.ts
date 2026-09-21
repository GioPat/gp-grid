// packages/core/tests/column-pinning-followup.test.ts
// Regression coverage for the column-pinning slice 1 follow-up review, all
// through the published GridCore/state boundary. Each case is one finding.

import { afterEach, describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import { createInitialState } from "../src/types/ui-state";
import { createColumnWindowResolver } from "../src/geometry/column-window";
import { calculateFillHandlePosition } from "../src/utils/fill-helpers";
import type { ColumnDefinition, GridInstruction } from "../src/types";

const column = (field: string, extra: Partial<ColumnDefinition> = {}): ColumnDefinition => ({
  field, cellDataType: "text", width: 100, editable: true, ...extra,
});
const wideColumns = () => Array.from({ length: 100 }, (_, i) => column(`c${i}`));
const grids: GridCore<Record<string, unknown>>[] = [];
const fixture = async (columns = wideColumns(), width = 200) => {
  const grid = new GridCore<Record<string, unknown>>({
    columns, columnLayout: "fixed", columnOverscan: 0, rowHeight: 32,
    dataSource: createClientDataSource(Array.from({ length: 100 }, (_, id) => ({ id }))),
  });
  grids.push(grid);
  await grid.initialize();
  grid.setViewport(0, 0, width, 320);
  const batches: GridInstruction[][] = [];
  grid.onBatchInstruction((batch) => batches.push(batch));
  return { grid, batches };
};
afterEach(() => { for (const grid of grids.splice(0)) grid.destroy(); });
const ids = (columns: readonly { columnId: string }[]) => columns.map((c) => c.columnId);

describe("PRD 004 follow-up review", () => {
  it("hit-tests the third start pin", async () => {
    const { grid } = await fixture([
      column("a", { pinned: "start" }), column("b", { pinned: "start" }),
      column("c", { pinned: "start" }), column("d"),
    ], 400);
    expect(grid.geometry.hitTest({ x: 250, y: 16 }).columnId).toBe("c");
  });

  it("hit-tests the third end pin", async () => {
    const { grid } = await fixture([
      column("a"), column("b", { pinned: "end" }),
      column("c", { pinned: "end" }), column("d", { pinned: "end" }),
    ], 400);
    expect(grid.geometry.hitTest({ x: 350, y: 16 }).columnId).toBe("d");
  });

  it("hit-tests three unequal-width pins by their own edges", async () => {
    const { grid } = await fixture([
      column("a", { pinned: "start", width: 90 }),
      column("b", { pinned: "start", width: 120 }),
      column("c", { pinned: "start", width: 80 }),
      column("d"),
    ], 400);
    const at = (x: number) => grid.geometry.hitTest({ x, y: 16 }).columnId;
    expect(at(10)).toBe("a");
    expect(at(95)).toBe("b");
    expect(at(250)).toBe("c");
    expect(at(320)).toBe("d");
  });

  it("preserves the after-last-column sentinel", async () => {
    const { grid } = await fixture([column("a"), column("b")], 400);
    expect(grid.geometry.hitTest({ x: 300, y: 16 })).toMatchObject({ displayIndex: 2, col: -1 });
  });

  it("aligns a backward scroll target after the start pin", async () => {
    const { grid } = await fixture([
      column("a", { pinned: "start" }), column("b"), column("c"), column("d"), column("e"),
    ], 300);
    grid.setViewport(0, 200, 300, 320);
    expect(grid.geometry.getScrollTarget(0, 1)).toEqual({ scrollLeft: 0 });
  });

  it("keeps an oversized center column aligned with the center start", async () => {
    const { grid } = await fixture([
      column("a", { pinned: "start" }), column("b", { width: 300 }), column("c"),
    ], 300);
    expect(grid.geometry.getScrollTarget(0, 1)).toEqual({});
  });

  it("does not replace active edit retention when a new edit is refused", async () => {
    const columns = wideColumns();
    columns[90] = column("c90", { editable: false });
    const { grid } = await fixture(columns);
    expect(grid.startEdit(0, 60)).toBe(true);
    expect(grid.startEdit(0, 90)).toBe(false);
    expect(grid.getEditState()).toMatchObject({ col: 60 });
    expect(ids(grid.geometry.getColumnWindow().center)).toContain("c60");
  });

  it("publishes edit and retention in one atomic batch", async () => {
    const { grid, batches } = await fixture();
    grid.startEdit(0, 60);
    const editBatch = batches.find((batch) => batch.some((i) => i.type === "START_EDIT"));
    expect(editBatch?.some((i) => i.type === "SET_COLUMN_WINDOW")).toBe(true);
  });

  it("merges retained edits in displayed order", async () => {
    const { grid } = await fixture();
    grid.startEdit(0, 0);
    grid.setViewport(0, 2000, 200, 320);
    expect(ids(grid.geometry.getColumnWindow().center)).toEqual(["c0", "c20", "c21"]);
  });

  it("ignores excess registrations instead of evicting an existing edit", async () => {
    const { grid } = await fixture();
    const resolver = createColumnWindowResolver({
      getLayout: () => grid.geometry.getColumnLayout(), getScrollLeft: () => 0,
      getViewportWidth: () => 200, getOverscan: () => 0,
    });
    resolver.retain("edit", ["c60"]);
    resolver.retain("measurement", Array.from({ length: 16 }, (_, i) => `c${70 + i}`));
    expect(ids(resolver.get().center)).toContain("c60");
  });

  it("suppresses a center fill handle whose edge sits under an end pin", async () => {
    const { grid } = await fixture([
      column("a", { pinned: "start" }), column("b", { width: 250 }),
      column("c"), column("z", { pinned: "end" }),
    ], 400);
    expect(calculateFillHandlePosition({
      core: grid, activeCell: { row: 0, col: 1 }, selectionRange: null,
    })).toBeNull();
  });

  it("keeps rows coordinates in the rows wrapper space", async () => {
    const { grid } = await fixture([
      column("a"), column("b"), column("c", { pinned: "end" }),
    ], 300);
    expect(grid.geometry.getCellBounds(0, 2, "rows")?.left).toBe(200);
  });

  it("seeds an empty window for a measured collapsed center", () => {
    const state = createInitialState({
      initialColumns: [column("a", { pinned: "start", width: 200 }), column("b")],
      initialWidth: 200, initialColumnLayout: "fixed",
    });
    expect(state.columnWindow?.center).toEqual([]);
  });

  it("gives seed and live layouts the same column identity indices", async () => {
    const columns = [column("a"), column("b", { pinned: "start" }), column("c")];
    const state = createInitialState({ initialColumns: columns, initialWidth: 300, initialColumnLayout: "fixed" });
    const { grid } = await fixture(columns, 300);
    const expected = [["b", 0], ["a", 1], ["c", 2]];
    expect(state.layout?.columns.map((c) => [c.columnId, c.layoutIndex])).toEqual(expected);
    expect(grid.geometry.getColumnLayout().columns.map((c) => [c.columnId, c.layoutIndex]))
      .toEqual(expected);
  });

  it("publishes a single geometry revision in a resized viewport batch", async () => {
    const { grid, batches } = await fixture();
    grid.setViewport(0, 0, 450, 320);
    const revisions = new Set(batches.flat().flatMap((i) => "revision" in i ? [i.revision] : []));
    expect(revisions.size).toBe(1);
  });
});
