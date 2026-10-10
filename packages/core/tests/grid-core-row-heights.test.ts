// packages/core/tests/grid-core-row-heights.test.ts
// Slice 2: the public `rowHeights` commands through GridCore, over 1,000
// client rows with a stable identity, a 32 px default height and a 320 px body.

import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { RowHeightsController } from "../src/grid-core-row-heights";
import { InstructionBatcher } from "../src/managers";
import { RowHeightOverrides } from "../src/managers/row-height-overrides";
import { createClientDataSource } from "../src/data-source";
import type {
  ColumnDefinition,
  FreezeRowsOptions,
  GridInstruction,
  MoveSlotInstruction,
  RowId,
} from "../src/types";
import type { FrozenRowsState } from "../src/geometry";

interface Row {
  id: number;
  name: string;
}

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 36;
const WIDTH = 400;
const HEIGHT = 320;
const ROW_COUNT = 1_000;
/** Published content height with no placed size: the row extent plus the header band. */
const FLAT_CONTENT_HEIGHT = ROW_COUNT * ROW_HEIGHT + HEADER_HEIGHT;

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80 },
  { field: "name", cellDataType: "text", width: 200 },
];

const rowsOf = (count: number): Row[] =>
  Array.from({ length: count }, (_, id) => ({ id, name: `Name ${id}` }));

interface HarnessOptions {
  getRowId?: (row: Row) => RowId;
  freezeRows?: FreezeRowsOptions;
  count?: number;
}

const createGrid = async (options: HarnessOptions = {}) => {
  const changed: FrozenRowsState[] = [];
  const grid = new GridCore<Row>({
    columns,
    dataSource: createClientDataSource(rowsOf(options.count ?? ROW_COUNT)),
    rowHeight: ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    overscan: 2,
    onFrozenRowsChanged: (state) => changed.push(state),
    getRowId: options.getRowId,
    freezeRows: options.freezeRows,
  });
  await grid.initialize();
  grid.setViewport(0, 0, WIDTH, HEIGHT);
  return { grid, changed };
};

const record = (grid: GridCore<Row>): GridInstruction[][] => {
  const batches: GridInstruction[][] = [];
  grid.onBatchInstruction((batch) => batches.push([...batch]));
  return batches;
};

const contentHeight = (grid: GridCore<Row>): number => grid.geometry.getContentSize().height;

/** `SET_CONTENT_SIZE.height` covers the row extent plus the header band. */
const publishedHeight = (grid: GridCore<Row>): number => contentHeight(grid) + HEADER_HEIGHT;

const heightAt = (grid: GridCore<Row>, viewIndex: number): number | undefined => {
  const bounds = grid.geometry.getRowBounds(viewIndex, "content");
  return bounds === undefined ? undefined : bounds.end - bounds.start;
};

const movesOf = (batch: GridInstruction[]): MoveSlotInstruction[] =>
  batch.filter((instruction): instruction is MoveSlotInstruction => instruction.type === "MOVE_SLOT");

const scrollTosOf = (batch: GridInstruction[]): number[] =>
  batch.flatMap((instruction) =>
    instruction.type === "SCROLL_TO" && instruction.scrollTop !== undefined
      ? [instruction.scrollTop]
      : [],
  );

describe("GridCore.rowHeights — above-viewport anchor (AC-006-04)", () => {
  it("keeps the clip-top row in place and shifts the rows below it", async () => {
    const { grid } = await createGrid({ getRowId: (row) => row.id });
    grid.setViewport(3_200, 0, WIDTH, HEIGHT);
    const firstVisible = grid.geometry.getVisibleRowWindow().start;
    const topBefore = grid.geometry.getRowBounds(firstVisible, "viewport")?.start;
    const heightBefore = contentHeight(grid);
    const batches = record(grid);

    grid.rowHeights.set([{ rowId: 5, height: 96 }]);

    expect(batches).toHaveLength(1);
    const batch = batches[0]!;
    const contentSize = batch.find((instruction) => instruction.type === "SET_CONTENT_SIZE");
    expect(contentHeight(grid)).toBe(heightBefore + 64);
    expect(contentSize?.type === "SET_CONTENT_SIZE" && contentSize.height).toBe(
      publishedHeight(grid),
    );
    expect(scrollTosOf(batch)).toEqual([3_264]);

    // The anchor row keeps its viewport top; the mounted rows below it moved.
    expect(grid.geometry.getRowBounds(firstVisible, "viewport")?.start).toBe(topBefore);
    const moved = movesOf(batch);
    expect(moved.length).toBeGreaterThan(0);
    for (const instruction of moved) expect(instruction.height).toBe(ROW_HEIGHT);
    expect(moved.some((instruction) => instruction.translateY === 3_264)).toBe(true);
    expect(heightAt(grid, 5)).toBe(96);
  });

  it("emits no scroll correction for a height set below the viewport", async () => {
    const { grid } = await createGrid({ getRowId: (row) => row.id });
    grid.setViewport(3_200, 0, WIDTH, HEIGHT);
    const batches = record(grid);

    grid.rowHeights.set([{ rowId: 500, height: 96 }]);

    expect(batches).toHaveLength(1);
    expect(scrollTosOf(batches[0]!)).toEqual([]);
    expect(contentHeight(grid)).toBe(ROW_COUNT * ROW_HEIGHT + 64);
  });

  it("publishes the placed height on the mounted row", async () => {
    const { grid } = await createGrid({ getRowId: (row) => row.id });
    const batches = record(grid);

    grid.rowHeights.set([{ rowId: 2, height: 96 }]);

    const moved = movesOf(batches[0]!);
    expect(moved.some((instruction) => instruction.height === 96)).toBe(true);
    expect(heightAt(grid, 2)).toBe(96);
    expect(grid.geometry.getRowBounds(2, "content")).toEqual({ start: 64, end: 160 });
  });
});

describe("GridCore.rowHeights — frozen anchor (AC-006-04)", () => {
  it("grows the frozen block without moving the suffix", async () => {
    const { grid } = await createGrid({
      getRowId: (row) => row.id,
      freezeRows: { count: 3 },
    });
    // Offset of the first suffix row below the band's bottom edge.
    const belowBand = (): number =>
      (grid.geometry.getRowBounds(3, "viewport")?.start ?? 0) -
      grid.geometry.getRowRegions().frozenExtent;
    const before = belowBand();
    const batches = record(grid);

    grid.rowHeights.set([{ rowId: 1, height: 96 }]);

    const batch = batches[0]!;
    const regions = batch.find((instruction) => instruction.type === "SET_ROW_REGIONS");
    expect(regions?.type === "SET_ROW_REGIONS" && regions.regions.frozenExtent).toBe(160);
    expect(scrollTosOf(batch)).toEqual([]);
    expect(belowBand()).toBe(before);
    expect(movesOf(batch).some((instruction) => instruction.height === 96)).toBe(true);
  });

  it("lowers the effective frozen count when the block no longer fits", async () => {
    const { grid, changed } = await createGrid({
      getRowId: (row) => row.id,
      freezeRows: { count: 3 },
    });
    changed.length = 0;

    grid.rowHeights.set([{ rowId: 1, height: 400 }]);

    expect(grid.geometry.getRowRegions().frozen).toEqual({
      requestedCount: 3,
      effectiveCount: 1,
      limit: "viewport",
    });
    expect(changed).toEqual([{ requestedCount: 3, effectiveCount: 1, limit: "viewport" }]);
    expect(grid.geometry.getRowRegions().frozenExtent).toBe(ROW_HEIGHT);
  });
});

describe("GridCore.rowHeights — identity (AC-006-03)", () => {
  it("follows its row through a descending sort", async () => {
    const { grid } = await createGrid({ getRowId: (row) => row.id });
    grid.rowHeights.set([{ rowId: 5, height: 96 }]);
    expect(heightAt(grid, 5)).toBe(96);

    await grid.sortFilter.setSort("id", "desc");

    const descendingIndex = ROW_COUNT - 1 - 5;
    expect(grid.rows.getId(descendingIndex)).toBe(5);
    expect(heightAt(grid, descendingIndex)).toBe(96);
    expect(heightAt(grid, 5)).toBe(ROW_HEIGHT);
    expect(grid.rowHeights.getOverrides()).toEqual([{ rowId: 5, height: 96 }]);
  });

  it("drops an index-scoped height when the query changes", async () => {
    const { grid } = await createGrid();
    grid.rowHeights.set([{ rowId: 5, height: 96 }]);
    expect(heightAt(grid, 5)).toBe(96);

    await grid.sortFilter.setSort("id", "desc");

    expect(grid.rowHeights.getOverrides()).toEqual([]);
    expect(heightAt(grid, 5)).toBe(ROW_HEIGHT);
    expect(contentHeight(grid)).toBe(ROW_COUNT * ROW_HEIGHT);
  });

  it("moves the height with its row on a row drag", async () => {
    const { grid } = await createGrid({ getRowId: (row) => row.id });
    grid.rowHeights.set([{ rowId: 5, height: 96 }]);

    grid.rowDrag.commit(5, 700);

    const movedIndex = Array.from({ length: ROW_COUNT }, (_, index) => index).find(
      (index) => grid.rows.getId(index) === 5,
    );
    expect(movedIndex).toBeDefined();
    expect(heightAt(grid, movedIndex!)).toBe(96);
    expect(heightAt(grid, 5)).not.toBe(96);
    expect(grid.rowHeights.getOverrides()).toEqual([{ rowId: 5, height: 96 }]);
  });
});

describe("GridCore.rowHeights — row drag without a movable source", () => {
  it("keeps an index-scoped height when nothing moved", async () => {
    const client = createClientDataSource(rowsOf(ROW_COUNT));
    const grid = new GridCore<Row>({
      columns,
      // A source without `moveRow` cannot move rows, so the commit is a no-op.
      dataSource: { loadMode: client.loadMode, query: (request) => client.query(request) },
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
    });
    await grid.initialize();
    grid.setViewport(0, 0, WIDTH, HEIGHT);
    grid.rowHeights.set([{ rowId: 5, height: 96 }]);

    grid.rowDrag.commit(5, 700);

    expect(grid.rowHeights.getOverrides()).toEqual([{ rowId: 5, height: 96 }]);
    expect(heightAt(grid, 5)).toBe(96);
  });
});

describe("GridCore.rowHeights — reset and no-ops", () => {
  it("restores the flat geometry on reset", async () => {
    const { grid } = await createGrid({ getRowId: (row) => row.id });
    grid.rowHeights.set([{ rowId: 5, height: 96 }]);
    expect(contentHeight(grid)).toBe(ROW_COUNT * ROW_HEIGHT + 64);
    const batches = record(grid);

    grid.rowHeights.reset();

    expect(grid.rowHeights.getOverrides()).toEqual([]);
    expect(contentHeight(grid)).toBe(ROW_COUNT * ROW_HEIGHT);
    expect(heightAt(grid, 5)).toBe(ROW_HEIGHT);
    const contentSize = batches.flat().find((instruction) => instruction.type === "SET_CONTENT_SIZE");
    expect(contentSize?.type === "SET_CONTENT_SIZE" && contentSize.height).toBe(
      FLAT_CONTENT_HEIGHT,
    );
  });

  it("emits nothing for a value-equal set and lists a pending identity", async () => {
    const { grid } = await createGrid({ getRowId: (row) => row.id });
    grid.rowHeights.set([{ rowId: 5, height: 96 }]);
    const batches = record(grid);

    grid.rowHeights.set([{ rowId: 5, height: 96 }]);
    expect(batches).toHaveLength(0);

    grid.rowHeights.set([{ rowId: "not-resident", height: 64 }]);
    expect(grid.rowHeights.getOverrides()).toEqual([
      { rowId: 5, height: 96 },
      { rowId: "not-resident", height: 64 },
    ]);
    expect(contentHeight(grid)).toBe(ROW_COUNT * ROW_HEIGHT + 64);
  });

  it("is a no-op after destroy", async () => {
    const { grid } = await createGrid({ getRowId: (row) => row.id });
    const batches = record(grid);

    grid.destroy();
    grid.rowHeights.set([{ rowId: 5, height: 96 }]);

    expect(batches).toHaveLength(0);
    expect(grid.rowHeights.getOverrides()).toEqual([]);
  });

  it("applies a height without a scroll correction when there is no suffix clip", async () => {
    const { grid } = await createGrid({ getRowId: (row) => row.id });
    grid.setViewport(0, 0, WIDTH, 0);
    const batches = record(grid);

    grid.rowHeights.set([{ rowId: 5, height: 96 }]);

    expect(batches).toHaveLength(1);
    expect(scrollTosOf(batches[0]!)).toEqual([]);
    expect(heightAt(grid, 5)).toBe(96);
  });
});

describe("RowHeightsController — after destroy", () => {
  const unreachable: never = new Proxy(() => undefined, {
    apply: () => {
      throw new Error("reached a destroyed controller");
    },
    get: () => {
      throw new Error("reached a destroyed controller");
    },
  }) as never;

  const createDestroyed = () => {
    const batcher = new InstructionBatcher();
    const batches: GridInstruction[][] = [];
    batcher.subscribe((batch) => batches.push([...batch]));
    const controller = new RowHeightsController<Row>({
      batcher,
      overrides: new RowHeightOverrides({
        getRowHeight: () => ROW_HEIGHT,
        getRowCount: () => ROW_COUNT,
        hasStableIdentity: () => true,
        getDataRevision: () => 0,
      }),
      getGeometry: unreachable,
      rowData: unreachable,
      view: unreachable,
      viewport: unreachable,
      isDestroyed: () => true,
      fitLimits: { min: ROW_HEIGHT, max: 10 * ROW_HEIGHT },
    });
    return { controller, batches };
  };

  it("ignores reset, loaded rows and moved rows", () => {
    const { controller, batches } = createDestroyed();

    controller.reset();
    controller.onRowsLoaded(true);
    controller.onRowsMoved();

    expect(batches).toHaveLength(0);
  });
});

describe("GridCore.rowHeights — flat stream", () => {
  it("keeps the fixed axis and publishes the default height", async () => {
    const { grid } = await createGrid();
    const batches = record(grid);

    grid.setViewport(64, 0, WIDTH, HEIGHT);

    const moved = batches.flatMap((batch) => movesOf(batch));
    expect(moved.length).toBeGreaterThan(0);
    for (const instruction of moved) expect(instruction.height).toBe(ROW_HEIGHT);
    expect(contentHeight(grid)).toBe(ROW_COUNT * ROW_HEIGHT);
    expect(grid.rowHeights.getOverrides()).toEqual([]);
  });
});
