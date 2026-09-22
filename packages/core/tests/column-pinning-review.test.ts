// packages/core/tests/column-pinning-review.test.ts
// Regression coverage for column pinning. Each case uses the
// published GridCore/state boundary, not the internal resolver: the review's
// findings were mostly invisible through the pure functions.

import { afterEach, describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { ColumnModel } from "../src/column-model";
import { createClientDataSource } from "../src/data-source";
import { createColumnWindowResolver } from "../src/geometry/column-window";
import { createSeedColumnLayout } from "../src/geometry/column-layout";
import { createColumnGeometry } from "../src/geometry/column-geometry";
import { createInitialState } from "../src/types/ui-state";
import { calculateFillHandlePosition } from "../src/utils/fill-helpers";
import type { ColumnDefinition, GridInstruction } from "../src/types";

const column = (field: string, extra: Partial<ColumnDefinition> = {}): ColumnDefinition => ({
  field, cellDataType: "text", width: 100, editable: true, ...extra,
});
const wideColumns = (): ColumnDefinition[] =>
  Array.from({ length: 100 }, (_, i) => column(`c${i}`));

const grids: GridCore<Record<string, unknown>>[] = [];
const fixture = async (
  columns: ColumnDefinition[] = wideColumns(),
  width = 200,
): Promise<{ grid: GridCore<Record<string, unknown>>; instructions: GridInstruction[] }> => {
  const grid = new GridCore<Record<string, unknown>>({
    columns,
    columnLayout: "fixed",
    columnOverscan: 0,
    rowHeight: 32,
    dataSource: createClientDataSource(Array.from({ length: 100 }, (_, id) => ({ id }))),
  });
  grids.push(grid);
  await grid.initialize();
  grid.setViewport(0, 0, width, 320);
  const instructions: GridInstruction[] = [];
  grid.onBatchInstruction((batch) => instructions.push(...batch));
  return { grid, instructions };
};

afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
});

const ids = (columns: readonly { columnId: string }[]): string[] =>
  columns.map((c) => c.columnId);

describe("column pinning — window and geometry", () => {
  it("[1] maps the center-local range to displayed indices without duplicate pins", async () => {
    const { grid } = await fixture([
      column("a", { pinned: "start" }),
      column("b", { pinned: "start" }),
      column("c"),
      column("d"),
      column("e", { pinned: "end" }),
    ], 450);

    const window = grid.geometry.getColumnWindow();
    expect(ids(window.start)).toEqual(["a", "b"]);
    expect(ids(window.center)).toEqual(["c", "d"]);
    expect(ids(window.end)).toEqual(["e"]);
    expect(window.range).toEqual({ start: 2, end: 4 });
  });

  it("[2] hit-tests each admitted start pin", async () => {
    const { grid } = await fixture([
      column("a", { pinned: "start" }),
      column("b", { pinned: "start" }),
      column("c"),
    ], 300);

    expect(grid.geometry.hitTest({ x: 50, y: 16 }).columnId).toBe("a");
    expect(grid.geometry.hitTest({ x: 150, y: 16 }).columnId).toBe("b");
    expect(grid.geometry.hitTest({ x: 250, y: 16 }).columnId).toBe("c");
  });

  it("[3] scrolls a center target into the center clip", async () => {
    const { grid } = await fixture([
      column("a", { width: 200, pinned: "start" }),
      column("b", { width: 300 }),
      column("c"),
      column("z", { width: 150, pinned: "end" }),
    ], 500);

    // The clip in content space is [200, 350): column c's right edge (400)
    // must reach the end pin's viewport edge, so the sample is its excess.
    expect(grid.geometry.getScrollTarget(0, 2)).toEqual({ scrollLeft: 250 });
  });

  it("[3] does not request horizontal scrolling for a collapsed center", async () => {
    const { grid } = await fixture([
      column("a", { width: 200, pinned: "start" }),
      column("b"),
      column("z", { width: 300, pinned: "end" }),
    ], 500);

    expect(grid.geometry.getScrollTarget(0, 1)).toEqual({});
  });

  it("[6] reports the center clip in viewport space", async () => {
    const columns = wideColumns();
    columns[0] = column("c0", { pinned: "start" });
    columns[99] = column("c99", { pinned: "end" });
    const { grid } = await fixture(columns, 400);

    grid.setViewport(0, 100, 400, 320);
    expect(grid.geometry.getColumnClip(3)).toEqual({ start: 100, end: 300 });
  });

  it("[14] excludes a column beginning exactly at the half-open right edge", async () => {
    const { grid } = await fixture();
    expect(ids(grid.geometry.getColumnWindow().center)).toEqual(["c0", "c1"]);
  });

  it("[15] advances the geometry revision when only the column window moves", async () => {
    const { grid } = await fixture();
    const before = grid.geometry.revision;
    grid.setViewport(0, 2000, 200, 320);
    expect(grid.geometry.revision).toBeGreaterThan(before);
  });

  it("[15] does not advance the revision for an unmoved window", async () => {
    const { grid } = await fixture();
    grid.setViewport(0, 200, 200, 320);
    const settled = grid.geometry.revision;
    grid.setViewport(0, 200, 200, 320);
    expect(grid.geometry.revision).toBe(settled);
  });

  it("[17] keeps hit testing indexed for wide flat layouts", () => {
    let offsetReads = 0;
    const layout = createSeedColumnLayout(
      Array.from({ length: 1_000 }, (_, i) => column(`c${i}`)),
      "fixed",
      300,
    );
    const columns = layout.columns.map((col) => ({
      ...col,
      get offset() { offsetReads += 1; return col.offset; },
    }));
    const geometry = createColumnGeometry({ ...layout, columns });

    expect(geometry.displayedAt(99950, 0)).toBe(999);
    expect(offsetReads).toBeLessThan(50);
  });
});

describe("column pinning — publication", () => {
  it("[4] publishes the column window when both axes scroll", async () => {
    const { grid, instructions } = await fixture();
    grid.setViewport(32, 2000, 200, 320);
    expect(instructions.some((i) => i.type === "SET_COLUMN_WINDOW")).toBe(true);
  });

  it("[4] publishes the column window on a horizontal-only scroll", async () => {
    const { grid, instructions } = await fixture();
    grid.setViewport(0, 2000, 200, 320);
    expect(instructions.some((i) => i.type === "SET_COLUMN_WINDOW")).toBe(true);
  });

  it("[5] publishes retention when starting an off-window edit", async () => {
    const { grid, instructions } = await fixture();
    grid.startEdit(0, 60);

    expect(instructions.some((i) => i.type === "SET_COLUMN_WINDOW")).toBe(true);
    expect(ids(grid.geometry.getColumnWindow().center)).toContain("c60");
  });

  it("[5] registers retention before the edit instruction reaches listeners", async () => {
    const { grid } = await fixture();
    const seen: GridInstruction[][] = [];
    grid.onBatchInstruction((batch) => seen.push(batch));

    grid.startEdit(0, 60);

    // The window is mounted in the same delivery as the editor, before it.
    const lifecycle = seen.flat();
    const windowAt = lifecycle.findIndex((i) => i.type === "SET_COLUMN_WINDOW");
    const editAt = lifecycle.findIndex((i) => i.type === "START_EDIT");
    expect(windowAt).toBeGreaterThanOrEqual(0);
    expect(windowAt).toBeLessThan(editAt);
  });

  it("[13] caps retained columns, not just registration keys", async () => {
    const { grid } = await fixture();
    const resolver = createColumnWindowResolver({
      getLayout: () => grid.geometry.getColumnLayout(),
      getScrollLeft: () => 0,
      getViewportWidth: () => 200,
      getOverscan: () => 0,
    });

    resolver.retain("measurement", wideColumns().map((c) => c.field));
    expect(resolver.get().center.length).toBeLessThanOrEqual(18);
  });

  it("[13] releases a registration so it can be replaced", async () => {
    const { grid } = await fixture();
    const resolver = createColumnWindowResolver({
      getLayout: () => grid.geometry.getColumnLayout(),
      getScrollLeft: () => 0,
      getViewportWidth: () => 200,
      getOverscan: () => 0,
    });

    resolver.retain("measurement", ["c90"]);
    expect(ids(resolver.get().center)).toContain("c90");
    resolver.retain("measurement", []);
    expect(ids(resolver.get().center)).not.toContain("c90");
  });
});

describe("column pinning — seed and state", () => {
  it("[8] partitions definition pins in the seed layout", () => {
    const state = createInitialState({
      initialColumns: [column("a"), column("b", { pinned: "start" }), column("c")],
      initialColumnLayout: "fixed",
      initialWidth: 300,
    });
    expect(ids(state.columnWindow!.start)).toEqual(["b"]);
  });

  it("[9] seeds a bounded window instead of every center column", () => {
    const state = createInitialState({
      initialColumns: wideColumns(),
      initialColumnLayout: "fixed",
      initialWidth: 300,
    });
    expect(state.columnWindow!.center.length).toBeLessThan(30);
  });

  it("[10] applies pin partitioning before an order in the same update", () => {
    const model = new ColumnModel([
      column("a", { pinned: "start" }),
      column("b", { pinned: "start" }),
      column("c"),
    ]);
    model.setState([{ columnId: "c", pinned: "start", order: 0 }]);
    expect(model.ids()).toEqual(["c", "a", "b"]);
  });

  it("[11] adopts the requested target region at a forward drop boundary", () => {
    const model = new ColumnModel([
      column("a", { pinned: "start" }),
      column("b"),
      column("c", { pinned: "end" }),
    ]);
    model.move(0, 2);
    expect(model.getPin("a")).toBe("end");
  });

  it("[12] preserves an editor while resetting only the pin state", async () => {
    const { grid } = await fixture([column("a"), column("b"), column("c")], 300);
    grid.setColumnPinned("c", "start");
    grid.startEdit(0, 0);
    grid.updateEditValue("draft");
    grid.resetColumnState(["c"]);

    // The editor stays open and follows its column (c) back to base slot 2.
    expect(grid.getEditState()).toMatchObject({ col: 2, currentValue: "draft" });
    expect(grid.getColumnState().map((state) => state.pinned)).toEqual([null, null, null]);
  });

  it("[12] commits an editor whose column returns to a hidden default", async () => {
    const { grid } = await fixture([
      column("a"),
      column("b", { hidden: true }),
      column("c"),
    ], 300);
    grid.setColumnState([{ columnId: "b", hidden: false }]);
    grid.startEdit(0, 1);
    grid.updateEditValue("draft");
    grid.resetColumnState();
    expect(grid.getEditState()).toBeNull();
  });

  it("[16] keeps seed pin lookup linear in the number of columns", () => {
    let idReads = 0;
    const columns = Array.from({ length: 1_000 }, (_, i) => ({
      ...column(`c${i}`),
      get colId() { idReads += 1; return `c${i}`; },
    }));
    createSeedColumnLayout(columns, "fixed", 300);
    expect(idReads).toBeLessThan(10_000);
  });
});

describe("column pinning — fill anchors", () => {
  it("[7] uses region-local coordinates for an end-pin fill handle", async () => {
    const { grid } = await fixture([column("a"), column("b"), column("c", { pinned: "end" })], 300);
    expect(calculateFillHandlePosition({
      core: grid,
      activeCell: { row: 0, col: 2 },
      selectionRange: null,
    })).toMatchObject({ region: "end", left: 80 });
  });

  it("[7] suppresses a center fill handle hidden behind a start pin", async () => {
    const { grid } = await fixture([
      column("a", { pinned: "start" }),
      column("b"),
      column("c"),
      column("d"),
    ], 300);
    grid.setViewport(0, 100, 300, 320);

    expect(calculateFillHandlePosition({
      core: grid,
      activeCell: { row: 0, col: 1 },
      selectionRange: null,
    })).toBeNull();
  });
});
