// packages/core/tests/grid-core-frozen-rows.test.ts
// Slice 2a: the production core keeps the flat path (C2 resolves zero), and
// the internal request seam publishes nonzero regions inside one atomic batch.
// Slice 2c: the public `freezeRows` option drives that seam, and the C9 event
// and C13 announcement follow the effective count and its limit.

import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import {
  createClientDataSource,
  createColumnarDataSource,
  createServerDataSource,
} from "../src/data-source";
import type {
  DataSource,
  ColumnDefinition,
  FreezeRowsOptions,
  GridCoreOptions,
  GridInstruction,
} from "../src/types";
import type { GridAnnouncement } from "../src/types/ui-state";
import type { FrozenRowsRequest, FrozenRowsState, RowRegionLayout } from "../src/geometry";

interface Row {
  id: number;
  name: string;
}

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 36;
const WIDTH = 400;
const HEIGHT = 320;

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80 },
  { field: "name", cellDataType: "text", width: 200 },
];

const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, id) => ({ id, name: `Name ${id}` }));

const createGrid = async (dataSource: DataSource<Row>): Promise<GridCore<Row>> => {
  const grid = new GridCore<Row>({
    columns,
    dataSource,
    rowHeight: ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    overscan: 2,
  });
  await grid.initialize();
  return grid;
};

const record = (grid: GridCore<Row>): GridInstruction[][] => {
  const batches: GridInstruction[][] = [];
  grid.onBatchInstruction((batch) => batches.push([...batch]));
  return batches;
};

const typesOf = (batches: GridInstruction[][]): string[][] =>
  batches.map((batch) => batch.map((instruction) => instruction.type));

const revisionsOf = (batch: GridInstruction[]): number[] =>
  batch.flatMap((instruction) => ("revision" in instruction ? [instruction.revision] : []));

/** Payload comparison that ignores the C9 region layout. */
const payloadOf = (instruction: GridInstruction): unknown => {
  if (instruction.type !== "SET_ROW_REGIONS") return instruction;
  const copy: Record<string, unknown> = { ...instruction };
  delete copy.regions;
  return copy;
};

const regionsOf = (batch: GridInstruction[]): RowRegionLayout | undefined => {
  const instruction = batch.find((candidate) => candidate.type === "SET_ROW_REGIONS");
  return instruction?.type === "SET_ROW_REGIONS" ? instruction.regions : undefined;
};

const publishedRegions = (batches: GridInstruction[][]): RowRegionLayout[] =>
  batches.map((batch) => regionsOf(batch)).filter((regions) => regions !== undefined);

const contentSizeOf = (batches: GridInstruction[][]): GridInstruction | undefined =>
  batches.flat().findLast((instruction) => instruction.type === "SET_CONTENT_SIZE");

const drive = (grid: GridCore<Row>, request: FrozenRowsRequest | null): void => {
  grid.setFrozenRowsRequest(request);
  driveFlat(grid);
};

/** Four viewport samples: two repeats, one move, one repeat. */
const driveFlat = (grid: GridCore<Row>): void => {
  grid.setViewport(0, 0, WIDTH, HEIGHT);
  grid.setViewport(0, 0, WIDTH, HEIGHT);
  grid.setViewport(64, 0, WIDTH, HEIGHT);
  grid.setViewport(64, 0, WIDTH, HEIGHT);
};

const announcementsOf = (batches: GridInstruction[][]): (GridAnnouncement | null)[] =>
  batches.flat().flatMap((instruction) =>
    instruction.type === "SET_ANNOUNCEMENT" ? [instruction.announcement] : []);

describe("GridCore — flat path with the region seam at zero", () => {
  it("emits the instruction stream the production request emits", async () => {
    const source = createClientDataSource(rows(1000));
    const production = await createGrid(source);
    const zero = await createGrid(source);
    const productionBatches = record(production);
    const zeroBatches = record(zero);

    drive(production, null);
    drive(zero, { requestedCount: 0 });

    expect(zeroBatches.length).toBeGreaterThan(0);
    expect(typesOf(zeroBatches)).toEqual(typesOf(productionBatches));
    expect(zeroBatches.map((batch) => batch.map(payloadOf))).toEqual(
      productionBatches.map((batch) => batch.map(payloadOf)),
    );
  });

  it("publishes only the zero-count layout and keeps today's flat hits", async () => {
    const source = createClientDataSource(rows(1000));
    const production = await createGrid(source);
    const zero = await createGrid(source);
    const productionBatches = record(production);
    const zeroBatches = record(zero);

    drive(production, null);
    drive(zero, { requestedCount: 0 });
    production.setViewport(0, 0, WIDTH, HEIGHT);
    zero.setViewport(0, 0, WIDTH, HEIGHT);

    const zeroCount = {
      frozenCount: 0,
      frozenExtent: 0,
      suffixViewportHeight: HEIGHT,
      frozen: { requestedCount: 0, effectiveCount: 0, limit: null },
    };
    expect(publishedRegions(zeroBatches)).toEqual([zeroCount]);
    expect(publishedRegions(productionBatches)).toEqual([zeroCount]);

    for (const grid of [zero, production]) {
      const layout = grid.geometry.getRowRegions();
      expect(layout.frozenCount).toBe(0);
      expect(layout.frozen.effectiveCount).toBe(0);
      expect(layout.frozen.limit).toBeNull();
      // Count zero keeps today's hit: only the axis sentinels carry no region.
      expect(grid.geometry.hitTest({ x: 40, y: 16 }).rowRegion).toBe("suffix");
      expect(grid.geometry.hitTest({ x: 40, y: -1 })).toMatchObject({
        row: -1,
        rowRegion: null,
      });
      expect(grid.geometry.hitTest({ x: 40, y: 32_001 })).toMatchObject({
        row: 1000,
        rowRegion: null,
      });
    }
  });

  it("keeps content height and the scroll range as row-extent arithmetic", async () => {
    const source = createClientDataSource(rows(1000));
    const grid = await createGrid(source);
    const batches = record(grid);
    grid.setViewport(0, 0, WIDTH, HEIGHT);
    grid.setFrozenRowsRequest({ requestedCount: 3 });

    // The frozen prefix must not grow either number (Slice 1 finding): the
    // sizer height stays the row extent plus the header band, and the range
    // stays the uncompressed row extent minus the body height.
    const contentSize = contentSizeOf(batches);
    expect(contentSize).toMatchObject({ height: 32_000 + HEADER_HEIGHT, rowsWrapperOffset: 0 });
    expect(grid.geometry.getContentSize().height).toBe(32_000);
    expect(grid.geometry.getRowScrollRange()).toEqual({ start: 0, end: 31_680 });
    expect(regionsOf(batches.at(-1)!)?.suffixViewportHeight).toBe(224);
  });

  it("publishes the payloads a wrapper already consumes", async () => {
    const grid = await createGrid(createClientDataSource(rows(1000)));
    const batches = record(grid);
    grid.setViewport(0, 0, WIDTH, HEIGHT);
    // A scroll recycles slots: the recycled payload is the flat one.
    grid.setViewport(10 * ROW_HEIGHT, 0, WIDTH, HEIGHT);

    expect(contentSizeOf(batches)).toMatchObject({
      type: "SET_CONTENT_SIZE",
      width: WIDTH,
      height: 32_000 + HEADER_HEIGHT,
      viewportWidth: WIDTH,
      viewportHeight: HEIGHT,
      rowsWrapperOffset: 0,
    });
    expect(batches.flat().some((i) => i.type === "SET_COLUMN_WINDOW")).toBe(true);

    const visible = batches.flat().findLast((i) => i.type === "UPDATE_VISIBLE_RANGE");
    const window = grid.geometry.getVisibleRowWindow();
    expect(visible).toEqual({
      type: "UPDATE_VISIBLE_RANGE",
      start: window.start,
      end: window.end - 1,
      rowsWrapperOffset: 0,
    });

    // The flat slot payload keeps exactly today's keys (C7): the region and
    // loading fields stay out while the row is a suffix row.
    const assigned = batches.flat().findLast((i) => i.type === "ASSIGN_SLOT");
    expect(assigned).toBeDefined();
    expect(Object.keys(assigned!)).toEqual([
      "type",
      "slotId",
      "rowIndex",
      "rowData",
      "generation",
    ]);
    const slotInstructions = batches
      .flat()
      .filter((i) => i.type === "CREATE_SLOT" || i.type === "ASSIGN_SLOT");
    expect(slotInstructions.some((i) => "region" in i || "loading" in i)).toBe(false);
  });
});

describe("GridCore — region request seam", () => {
  it("publishes nonzero regions atomically with the batch", async () => {
    const grid = await createGrid(createClientDataSource(rows(1000)));
    const batches = record(grid);
    grid.setViewport(0, 0, WIDTH, HEIGHT);
    grid.setFrozenRowsRequest({ requestedCount: 3 });

    const batch = batches.at(-1)!;
    expect(batch.map((instruction) => instruction.type)).toEqual(
      expect.arrayContaining(["SET_CONTENT_SIZE", "SET_ROW_REGIONS", "MOVE_SLOT"]),
    );
    expect(regionsOf(batch)).toEqual({
      frozenCount: 3,
      frozenExtent: 96,
      suffixViewportHeight: 224,
      frozen: { requestedCount: 3, effectiveCount: 3, limit: null },
    });
    expect(batch.some((i) => i.type === "CREATE_SLOT" && i.region === "frozen")).toBe(true);
    // One committed revision for the whole batch.
    expect(new Set(revisionsOf(batch)).size).toBe(1);
    expect(grid.geometry.getRowRegions().frozenCount).toBe(3);
  });

  it("re-publishes only when the count changes, never per scroll sample", async () => {
    const grid = await createGrid(createClientDataSource(rows(1000)));
    const batches = record(grid);
    grid.setViewport(0, 0, WIDTH, HEIGHT);
    grid.setFrozenRowsRequest({ requestedCount: 3 });
    const afterSeam = batches.length;

    grid.setViewport(32, 0, WIDTH, HEIGHT);
    grid.setViewport(64, 0, WIDTH, HEIGHT);
    expect(batches.slice(afterSeam).every((batch) => regionsOf(batch) === undefined)).toBe(true);

    // A shorter dataset lowers the effective count at the next refresh.
    await grid.sortFilter.setFilter("name", "Name 0");
    grid.setViewport(0, 0, WIDTH, HEIGHT - 64);
    expect(regionsOf(batches.at(-1)!)).toEqual({
      frozenCount: 1,
      frozenExtent: 32,
      suffixViewportHeight: HEIGHT - 64 - 32,
      frozen: { requestedCount: 3, effectiveCount: 1, limit: null },
    });
    expect(grid.geometry.getRowRegions().frozenCount).toBe(1);

    // Restoring the rows restores the request (C2).
    await grid.sortFilter.setFilter("name", "");
    grid.setViewport(0, 0, WIDTH, HEIGHT);
    expect(regionsOf(batches.at(-1)!)).toEqual({
      frozenCount: 3,
      frozenExtent: 96,
      suffixViewportHeight: 224,
      frozen: { requestedCount: 3, effectiveCount: 3, limit: null },
    });
  });

  it("mounts the frozen prefix alone when every row is frozen", async () => {
    const grid = await createGrid(createClientDataSource(rows(10)));
    const batches = record(grid);
    grid.setViewport(0, 0, WIDTH, HEIGHT);
    grid.setFrozenRowsRequest({ requestedCount: 1000 });

    const batch = batches.at(-1)!;
    expect(regionsOf(batch)).toEqual({
      frozenCount: 10,
      frozenExtent: 320,
      suffixViewportHeight: 0,
      frozen: { requestedCount: 1000, effectiveCount: 10, limit: null },
    });
    expect(batch.filter((i) => i.type === "CREATE_SLOT" && i.region === "frozen")).toHaveLength(10);
    expect(grid.geometry.getVisibleRowWindow()).toEqual({ start: 10, end: 10 });
    expect(grid.geometry.getRowWindow()).toEqual({ start: 10, end: 10 });

    // The block is part of the row extent: the sizer height is unchanged.
    expect(contentSizeOf(batches)).toMatchObject({ height: 320 + HEADER_HEIGHT });
    expect(grid.geometry.getContentSize().height).toBe(320);
  });

  it("reduces the prefix for the page budget and publishes zero when nothing fits", async () => {
    const grid = await createGrid(createClientDataSource(rows(1000)));
    const batches = record(grid);
    grid.setViewport(0, 0, WIDTH, HEIGHT);

    grid.setFrozenRowsRequest({ requestedCount: 8, admitsPrefix: (count) => count <= 2 });
    expect(regionsOf(batches.at(-1)!)).toEqual({
      frozenCount: 2,
      frozenExtent: 64,
      suffixViewportHeight: 256,
      frozen: { requestedCount: 8, effectiveCount: 2, limit: "cache" },
    });

    grid.setFrozenRowsRequest({ requestedCount: 8, admitsPrefix: () => false });
    expect(regionsOf(batches.at(-1)!)).toEqual({
      frozenCount: 0,
      frozenExtent: 0,
      suffixViewportHeight: HEIGHT,
      frozen: { requestedCount: 8, effectiveCount: 0, limit: "cache" },
    });
    expect(grid.geometry.getRowRegions().frozenCount).toBe(0);
  });
});

describe("GridCore — frozen rows over a paginated source", () => {
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  const createPaginatedGrid = async (
    requests: Array<[number, number]>,
    totalRows: number,
  ): Promise<GridCore<Row>> => {
    const dataSource = createServerDataSource<Row>(async (request) => {
      requests.push([request.range.startRow, request.range.endRow]);
      const length = Math.min(request.range.endRow, totalRows) - request.range.startRow;
      return {
        rows: Array.from({ length }, (_, index) => {
          const id = request.range.startRow + index;
          return { id, name: `Name ${id}` };
        }),
        totalRows,
      };
    });
    const grid = new GridCore<Row>({
      columns,
      dataSource,
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      overscan: 2,
      rowLoading: { cache: { pageSize: 100, prefetchPages: 0, maxPages: 3 } },
    });
    await grid.initialize();
    grid.setViewport(0, 0, WIDTH, HEIGHT);
    return grid;
  };

  it("starts the prefix fetch inside the seam's batch and never per scroll sample", async () => {
    const requests: Array<[number, number]> = [];
    const grid = await createPaginatedGrid(requests, 100_000);
    // Two deep samples: the second overflows the flat cap, so block 0 is gone
    // by the time the prefix is admitted and the seam must re-fetch it.
    grid.setViewport(32_000, 0, WIDTH, HEIGHT);
    await settle();
    grid.setViewport(64_000, 0, WIDTH, HEIGHT);
    await settle();
    expect(grid.rows.getData(0)).toBeUndefined();

    const batches = record(grid);
    grid.setFrozenRowsRequest({ requestedCount: 2 });

    const batch = batches.at(-1)!;
    expect(batch.map(({ type }) => type)).toEqual(
      expect.arrayContaining(["SET_CONTENT_SIZE", "SET_ROW_REGIONS"]),
    );
    expect(regionsOf(batch)).toEqual({
      frozenCount: 2,
      frozenExtent: 64,
      suffixViewportHeight: HEIGHT - 64,
      frozen: { requestedCount: 2, effectiveCount: 2, limit: null },
    });
    expect(new Set(revisionsOf(batch)).size).toBe(1);
    // The visible suffix was cached, so the frozen-only miss loads the prefix
    // without raising the overlay.
    expect(requests.at(-1)).toEqual([0, 100]);
    expect(batch.some(({ type }) => type === "DATA_LOADING")).toBe(false);

    const afterSeam = batches.length;
    grid.setViewport(64_000 + ROW_HEIGHT, 0, WIDTH, HEIGHT);
    grid.setViewport(64_000 + 2 * ROW_HEIGHT, 0, WIDTH, HEIGHT);
    expect(batches.slice(afterSeam).every((batch) => regionsOf(batch) === undefined)).toBe(true);
  });

  it("releases the prefix on unfreeze and re-requests it only when visible", async () => {
    const requests: Array<[number, number]> = [];
    const grid = await createPaginatedGrid(requests, 100_000);
    grid.setViewport(32_000, 0, WIDTH, HEIGHT);
    await settle();
    grid.setFrozenRowsRequest({ requestedCount: 2 });
    await settle();
    expect(grid.rows.getData(0)?.id).toBe(0);

    const afterFreeze = requests.length;
    const batches = record(grid);
    grid.setFrozenRowsRequest(null);
    await settle();

    expect(publishedRegions(batches).at(-1)).toMatchObject({ frozenCount: 0 });
    expect(grid.rows.getData(0)).toBeUndefined();
    expect(requests.slice(afterFreeze)).toEqual([]);

    grid.setViewport(32_000 + 10 * ROW_HEIGHT, 0, WIDTH, HEIGHT);
    await settle();
    expect(requests.slice(afterFreeze).some(([startRow]) => startRow === 0)).toBe(false);

    grid.setViewport(0, 0, WIDTH, HEIGHT);
    await settle();
    expect(requests.slice(afterFreeze)).toContainEqual([0, 100]);
    expect(grid.rows.getData(0)?.id).toBe(0);
  });

  it("re-derives the first range from row 0 after a filter reset", async () => {
    const requests: Array<[number, number]> = [];
    const grid = await createPaginatedGrid(requests, 100_000);
    grid.setViewport(32_000, 0, WIDTH, HEIGHT);
    await settle();
    grid.setFrozenRowsRequest({ requestedCount: 2 });
    await settle();

    const beforeReset = requests.length;
    await grid.sortFilter.setFilter("name", "Name 1");
    await settle();

    expect(requests.slice(beforeReset)).toEqual([[0, 100]]);
    expect(grid.rows.getData(0)?.id).toBe(0);
    expect(grid.geometry.getRowRegions().frozenCount).toBe(2);
  });
});

interface FrozenGrid {
  grid: GridCore<Row>;
  events: FrozenRowsState[];
  batches: GridInstruction[][];
}

const createFrozenGrid = async (
  freezeRows: FreezeRowsOptions | undefined,
  overrides: Partial<GridCoreOptions<Row>> = {},
): Promise<FrozenGrid> => {
  const events: FrozenRowsState[] = [];
  const grid = new GridCore<Row>({
    columns,
    dataSource: createClientDataSource(rows(1000)),
    rowHeight: ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    overscan: 2,
    freezeRows,
    onFrozenRowsChanged: (state) => events.push(state),
    ...overrides,
  });
  const batches = record(grid);
  await grid.initialize();
  return { grid, events, batches };
};

describe("GridCore — the public freezeRows option", () => {
  it("answers over the empty axis, then reports the first page once", async () => {
    const events: FrozenRowsState[] = [];
    const grid = new GridCore<Row>({
      columns,
      dataSource: createClientDataSource(rows(1000)),
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      overscan: 2,
      freezeRows: { count: 3 },
      onFrozenRowsChanged: (state) => events.push(state),
    });
    // C9's baseline is the empty-axis resolution, so the first page is a change.
    expect(grid.frozenRows.get()).toEqual({
      requestedCount: 3,
      effectiveCount: 0,
      limit: null,
    });
    const batches = record(grid);
    await grid.initialize();

    // The first page arrival is a real change: 0 -> 3 with no limit.
    expect(grid.frozenRows.get()).toEqual({
      requestedCount: 3,
      effectiveCount: 3,
      limit: null,
    });
    expect(events).toEqual([{ requestedCount: 3, effectiveCount: 3, limit: null }]);
    expect(regionsOf(batches.at(-1)!)).toEqual({
      frozenCount: 3,
      frozenExtent: 96,
      suffixViewportHeight: 504,
      frozen: { requestedCount: 3, effectiveCount: 3, limit: null },
    });
    // Unlimited: the event fires, the live region stays quiet.
    expect(announcementsOf(batches)).toEqual([]);

    // The viewport sample every wrapper sends on mount only moves the extent.
    grid.setViewport(0, 0, WIDTH, HEIGHT);
    expect(regionsOf(batches.at(-1)!)).toEqual({
      frozenCount: 3,
      frozenExtent: 96,
      suffixViewportHeight: HEIGHT - 96,
      frozen: { requestedCount: 3, effectiveCount: 3, limit: null },
    });
    driveFlat(grid);
    // The repeated samples change no region field: one event, no announcement.
    expect(events).toHaveLength(1);
    expect(announcementsOf(batches)).toHaveLength(0);
  });

  it("resolves a short viewport to zero and announces it in the region batch", async () => {
    const frozen = await createFrozenGrid({ count: 3 });
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    const before = frozen.events.length;

    // Row 0 plus the 64 px minimum suffix needs 96 px; 95 px admits neither.
    frozen.grid.setViewport(0, 0, WIDTH, 95);
    const batch = frozen.batches.at(-1)!;
    expect(batch.map(({ type }) => type)).toEqual(
      expect.arrayContaining(["SET_CONTENT_SIZE", "SET_ROW_REGIONS", "SET_ANNOUNCEMENT"]),
    );
    expect(regionsOf(batch)).toEqual({
      frozenCount: 0,
      frozenExtent: 0,
      suffixViewportHeight: 95,
      frozen: { requestedCount: 3, effectiveCount: 0, limit: "viewport" },
    });
    expect(frozen.events.slice(before)).toEqual([
      { requestedCount: 3, effectiveCount: 0, limit: "viewport" },
    ]);
    expect(announcementsOf([batch])).toEqual([
      { message: "0 of 3 rows frozen", revision: expect.any(Number) },
    ]);
    expect(new Set(revisionsOf(batch)).size).toBe(1);

    // Growing back restores the full request and announces it again.
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    expect(frozen.events.at(-1)).toEqual({
      requestedCount: 3,
      effectiveCount: 3,
      limit: null,
    });
    expect(announcementsOf([frozen.batches.at(-1)!])).toEqual([
      { message: "3 of 3 rows frozen", revision: expect.any(Number) },
    ]);
    expect(frozen.grid.geometry.getRowRegions().frozenCount).toBe(3);
  });

  it("caps at maxCount with exactly one event", async () => {
    const frozen = await createFrozenGrid({ count: 3, maxCount: 2 });
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);

    expect(frozen.events).toEqual([
      { requestedCount: 3, effectiveCount: 2, limit: "maxCount" },
    ]);
    expect(frozen.grid.frozenRows.get()).toEqual({
      requestedCount: 3,
      effectiveCount: 2,
      limit: "maxCount",
    });
    expect(announcementsOf(frozen.batches).at(-1)).toMatchObject({
      message: "2 of 3 rows frozen",
    });
  });

  it("reports the page-budget rejection once with the cache limit", async () => {
    const requests: Array<[number, number]> = [];
    const events: FrozenRowsState[] = [];
    const dataSource = createServerDataSource<Row>(async (request) => {
      requests.push([request.range.startRow, request.range.endRow]);
      const length = request.range.endRow - request.range.startRow;
      return {
        rows: Array.from({ length }, (_, index) => {
          const id = request.range.startRow + index;
          return { id, name: `Name ${id}` };
        }),
        totalRows: 100_000,
      };
    });
    const grid = new GridCore<Row>({
      columns,
      dataSource,
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      overscan: 2,
      freezeRows: { count: 3 },
      // Even zero frozen rows need a prefix-free visible block, so a single
      // page can never also hold the prefix (C8).
      rowLoading: { cache: { pageSize: 100, prefetchPages: 0, maxPages: 1 } },
      onFrozenRowsChanged: (state) => events.push(state),
    });
    await grid.initialize();
    grid.setViewport(0, 0, WIDTH, HEIGHT);

    expect(events).toEqual([
      { requestedCount: 3, effectiveCount: 0, limit: "cache" },
    ]);
    expect(grid.frozenRows.get().limit).toBe("cache");
    expect(grid.geometry.getRowRegions().frozenCount).toBe(0);
    expect(requests).toContainEqual([0, 100]);
  });

  it("stays silent for an equal-field resize, a scroll sample and count zero", async () => {
    const frozen = await createFrozenGrid({ count: 3, maxCount: 4 });
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    const settled = frozen.batches.length;

    // 320 -> 400 px still admits all three rows: neither field changes.
    frozen.grid.setViewport(0, 0, WIDTH, 400);
    frozen.grid.setViewport(2 * ROW_HEIGHT, 0, WIDTH, 400);
    expect(frozen.batches.length).toBeGreaterThan(settled);
    expect(announcementsOf(frozen.batches.slice(settled))).toEqual([]);
    expect(frozen.events).toHaveLength(1);

    const zero = await createFrozenGrid({ count: 0 });
    driveFlat(zero.grid);
    expect(zero.events).toEqual([]);
    expect(announcementsOf(zero.batches)).toEqual([]);
    expect(publishedRegions(zero.batches).at(-1)).toEqual({
      frozenCount: 0,
      frozenExtent: 0,
      suffixViewportHeight: HEIGHT,
      frozen: { requestedCount: 0, effectiveCount: 0, limit: null },
    });
  });

  it("keeps the flat path identical for an absent option and count zero", async () => {
    const source = createClientDataSource(rows(1000));
    const production = new GridCore<Row>({
      columns,
      dataSource: source,
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      overscan: 2,
    });
    const zero = new GridCore<Row>({
      columns,
      dataSource: source,
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      overscan: 2,
      freezeRows: { count: 0 },
    });
    const productionBatches = record(production);
    const zeroBatches = record(zero);
    await production.initialize();
    await zero.initialize();

    driveFlat(production);
    driveFlat(zero);

    expect(zeroBatches.length).toBeGreaterThan(0);
    expect(typesOf(zeroBatches)).toEqual(typesOf(productionBatches));
    expect(zeroBatches.map((batch) => batch.map(payloadOf))).toEqual(
      productionBatches.map((batch) => batch.map(payloadOf)),
    );
    expect(zero.frozenRows.get()).toEqual({
      requestedCount: 0,
      effectiveCount: 0,
      limit: null,
    });
    expect(zero.geometry.getRowRegions().frozenCount).toBe(0);
  });

  it("publishes no announcement that is null and fires nothing after destroy", async () => {
    const frozen = await createFrozenGrid({ count: 3, maxCount: 2 });
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    const announced = announcementsOf(frozen.batches);
    expect(announced.length).toBeGreaterThan(0);
    expect(announced.every((announcement) => announcement !== null)).toBe(true);

    const settled = frozen.events.length;
    const batchCount = frozen.batches.length;
    frozen.grid.destroy();
    frozen.grid.destroy();
    frozen.grid.setFrozenRowsRequest({ requestedCount: 6 });
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);

    expect(frozen.events).toHaveLength(settled);
    expect(frozen.batches).toHaveLength(batchCount);
  });
});

describe("GridCore — the C12 runtime freeze configuration", () => {
  const scrollsOf = (batch: GridInstruction[]): (number | undefined)[] =>
    batch.flatMap((instruction) =>
      instruction.type === "SCROLL_TO" ? [instruction.scrollTop] : []);

  it("rejects invalid configurations and leaves the layout untouched", async () => {
    const frozen = await createFrozenGrid(undefined);
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    const settled = frozen.batches.length;

    for (const config of [null, 3, "rows", { count: -1 }, { count: 1.5 }, {}]) {
      expect(() => frozen.grid.frozenRows.set(config as FreezeRowsOptions)).toThrow(RangeError);
    }
    expect(() => frozen.grid.frozenRows.set({ count: -1 })).toThrow("Invalid freezeRows.count: -1");
    expect(() => frozen.grid.frozenRows.set({ count: 1, maxCount: Number.NaN }))
      .toThrow("Invalid freezeRows.maxCount: NaN");
    expect(() => frozen.grid.frozenRows.set({ count: 1, minSuffixHeight: -1 }))
      .toThrow("Invalid freezeRows.minSuffixHeight: -1");
    expect(() => frozen.grid.frozenRows.set(null as unknown as FreezeRowsOptions))
      .toThrow("Invalid freezeRows: null");
    expect(() => frozen.grid.frozenRows.set({} as FreezeRowsOptions))
      .toThrow("Invalid freezeRows.count: undefined");

    expect(frozen.batches).toHaveLength(settled);
    expect(frozen.grid.geometry.getRowRegions().frozenCount).toBe(0);
    expect(frozen.grid.geometry.getRowRegions().suffixViewportHeight).toBe(HEIGHT);
  });

  it("publishes one atomic batch, one event and the requested count", async () => {
    const frozen = await createFrozenGrid(undefined);
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    const settledBatches = frozen.batches.length;
    const settledEvents = frozen.events.length;

    frozen.grid.frozenRows.set({ count: 3 });

    expect(frozen.batches).toHaveLength(settledBatches + 1);
    const batch = frozen.batches.at(-1)!;
    expect(batch.map(({ type }) => type)).toEqual(
      expect.arrayContaining(["SET_ROW_REGIONS", "SET_CONTENT_SIZE"]),
    );
    expect(regionsOf(batch)).toEqual({
      frozenCount: 3,
      frozenExtent: 96,
      suffixViewportHeight: HEIGHT - 96,
      frozen: { requestedCount: 3, effectiveCount: 3, limit: null },
    });
    expect(new Set(revisionsOf(batch)).size).toBe(1);
    expect(frozen.events.slice(settledEvents)).toEqual([
      { requestedCount: 3, effectiveCount: 3, limit: null },
    ]);
    expect(frozen.grid.frozenRows.get().requestedCount).toBe(3);
  });

  it("emits nothing for a value-equal configuration", async () => {
    const frozen = await createFrozenGrid({ count: 3, maxCount: 100, minSuffixHeight: 64 });
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    const settledBatches = frozen.batches.length;
    const settledEvents = frozen.events.length;

    frozen.grid.frozenRows.set({ count: 3, maxCount: 100, minSuffixHeight: 64 });
    frozen.grid.frozenRows.set({ count: 3 });

    expect(frozen.batches).toHaveLength(settledBatches);
    expect(frozen.events).toHaveLength(settledEvents);
    expect(frozen.grid.geometry.getRowRegions().frozenCount).toBe(3);

    // Unfreezing applies; a limit-only change under count zero then records
    // the config silently, because the composed request stays null.
    frozen.grid.frozenRows.set({ count: 0, maxCount: 7 });
    const afterUnfreeze = frozen.batches.length;
    expect(afterUnfreeze).toBe(settledBatches + 1);
    frozen.grid.frozenRows.set({ count: 0, maxCount: 8 });
    expect(frozen.batches).toHaveLength(afterUnfreeze);
  });

  it("replaces the whole config, so the result never depends on earlier calls", async () => {
    const frozen = await createFrozenGrid({ count: 3, maxCount: 2 });
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    expect(frozen.grid.frozenRows.get().limit).toBe("maxCount");

    frozen.grid.frozenRows.set({ count: 5 });
    expect(frozen.grid.frozenRows.get()).toEqual({
      requestedCount: 5,
      effectiveCount: 5,
      limit: null,
    });

    frozen.grid.frozenRows.set({ count: 3, maxCount: 2 });
    frozen.grid.frozenRows.freezeThrough(4);
    expect(frozen.grid.frozenRows.get()).toEqual({
      requestedCount: 5,
      effectiveCount: 2,
      limit: "maxCount",
    });
  });

  it("freezes and unfreezes through an index and rejects a fractional one", async () => {
    const frozen = await createFrozenGrid(undefined);
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);

    frozen.grid.frozenRows.freezeThrough(0);
    expect(frozen.grid.frozenRows.get()).toEqual({
      requestedCount: 1,
      effectiveCount: 1,
      limit: null,
    });
    expect(frozen.grid.geometry.getRowRegions().frozenExtent).toBe(ROW_HEIGHT);

    frozen.grid.frozenRows.freezeThrough(-1);
    expect(frozen.grid.frozenRows.get()).toEqual({
      requestedCount: 0,
      effectiveCount: 0,
      limit: null,
    });
    expect(frozen.grid.geometry.getRowRegions().frozenCount).toBe(0);

    expect(() => frozen.grid.frozenRows.freezeThrough(1.5)).toThrow("Invalid freezeRows.count: 2.5");
  });

  it("caps an over-large count at maxCount and at the viewport", async () => {
    const frozen = await createFrozenGrid({ count: 3, maxCount: 2 });
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    frozen.grid.frozenRows.set({ count: 50, maxCount: 2 });
    expect(frozen.grid.frozenRows.get()).toEqual({
      requestedCount: 50,
      effectiveCount: 2,
      limit: "maxCount",
    });

    // 32 + 64 px fits once in 100 px, a second row does not.
    const short = await createFrozenGrid(undefined);
    short.grid.setViewport(0, 0, WIDTH, 100);
    const settled = short.events.length;
    short.grid.frozenRows.set({ count: 50 });
    expect(short.grid.frozenRows.get()).toEqual({
      requestedCount: 50,
      effectiveCount: 1,
      limit: "viewport",
    });
    expect(short.events.slice(settled)).toHaveLength(1);
  });

  it("reports a page-budget rejection from the setter once", async () => {
    const events: FrozenRowsState[] = [];
    const dataSource = createServerDataSource<Row>(async (request) => {
      const length = request.range.endRow - request.range.startRow;
      return {
        rows: Array.from({ length }, (_, index) => {
          const id = request.range.startRow + index;
          return { id, name: `Name ${id}` };
        }),
        totalRows: 100_000,
      };
    });
    const grid = new GridCore<Row>({
      columns,
      dataSource,
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      overscan: 2,
      rowLoading: { cache: { pageSize: 100, prefetchPages: 0, maxPages: 1 } },
      onFrozenRowsChanged: (state) => events.push(state),
    });
    await grid.initialize();
    grid.setViewport(0, 0, WIDTH, HEIGHT);
    const settled = events.length;

    grid.frozenRows.set({ count: 3 });

    expect(events.slice(settled)).toEqual([
      { requestedCount: 3, effectiveCount: 0, limit: "cache" },
    ]);
    expect(grid.frozenRows.get().limit).toBe("cache");
    expect(grid.geometry.getRowRegions().frozenCount).toBe(0);
  });

  it("resolves against the 600 px estimate until the first measurement", async () => {
    const frozen = await createFrozenGrid({ count: 20 });
    // No viewport sample yet: 16 rows plus the 64 px minimum suffix fit 600.
    expect(frozen.grid.frozenRows.get()).toEqual({
      requestedCount: 20,
      effectiveCount: 16,
      limit: "viewport",
    });
    const settled = frozen.events.length;

    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    expect(frozen.grid.frozenRows.get()).toEqual({
      requestedCount: 20,
      effectiveCount: 8,
      limit: "viewport",
    });
    expect(frozen.events.slice(settled)).toHaveLength(1);

    // A measurement that changes neither field stays silent.
    const quiet = await createFrozenGrid({ count: 3 });
    quiet.grid.setViewport(0, 0, WIDTH, HEIGHT);
    const quietSettled = quiet.events.length;
    quiet.grid.setViewport(0, 0, WIDTH, 400);
    expect(quiet.grid.frozenRows.get()).toEqual({
      requestedCount: 3,
      effectiveCount: 3,
      limit: null,
    });
    expect(quiet.events).toHaveLength(quietSettled);
  });

  it("keeps the requested count across sort, filter and data source changes", async () => {
    const frozen = await createFrozenGrid(undefined);
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    frozen.grid.frozenRows.set({ count: 4 });

    await frozen.grid.sortFilter.setSort("name", "asc");
    expect(frozen.grid.frozenRows.get()).toEqual({
      requestedCount: 4,
      effectiveCount: 4,
      limit: null,
    });

    await frozen.grid.sortFilter.setFilter("name", "Name 1");
    expect(frozen.grid.frozenRows.get()).toEqual({
      requestedCount: 4,
      effectiveCount: 4,
      limit: null,
    });

    await frozen.grid.setDataSource(createClientDataSource(rows(500)));
    expect(frozen.grid.frozenRows.get()).toEqual({
      requestedCount: 4,
      effectiveCount: 4,
      limit: null,
    });
    expect(frozen.grid.geometry.getRowRegions().frozenCount).toBe(4);
  });

  it("corrects the DOM top when the block grows and keeps the anchor row", async () => {
    const frozen = await createFrozenGrid(undefined);
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    frozen.grid.frozenRows.set({ count: 3 });
    frozen.grid.setViewport(200, 0, WIDTH, HEIGHT);
    const anchor = frozen.grid.geometry.getVisibleRowWindow().start;
    const anchorTop = frozen.grid.geometry.getRowBounds(9, "viewport")!.start;

    frozen.grid.frozenRows.set({ count: 5 });

    // max(0, L − Δ): logical 200 minus the 64 px extent delta.
    const batch = frozen.batches.at(-1)!;
    expect(scrollsOf(batch)).toEqual([136]);
    // The correction carries no horizontal component.
    expect(batch.find((instruction) => instruction.type === "SCROLL_TO"))
      .toEqual({ type: "SCROLL_TO", scrollTop: 136 });
    expect(regionsOf(batch)).toMatchObject({ frozenCount: 5, frozenExtent: 160 });
    // The published range answers from the corrected sample: row 9 is still
    // the first visible suffix row, now below the taller block.
    expect(anchor).toBe(9);
    expect(batch.findLast((instruction) => instruction.type === "UPDATE_VISIBLE_RANGE"))
      .toMatchObject({ start: anchor });
    expect(frozen.grid.geometry.getVisibleRowWindow().start).toBe(anchor);
    expect(frozen.grid.geometry.getRowBounds(9, "viewport")!.start).toBe(anchorTop + 64);
  });

  it("clamps the correction at zero and skips a shrink or a stagnant change", async () => {
    const frozen = await createFrozenGrid(undefined);
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    frozen.grid.frozenRows.set({ count: 3 });
    frozen.grid.setViewport(32, 0, WIDTH, HEIGHT);

    // L 32 is below the 64 px growth: the corrected top clamps at zero.
    frozen.grid.frozenRows.set({ count: 5 });
    expect(scrollsOf(frozen.batches.at(-1)!)).toEqual([0]);

    // 5 -> 3 shrinks: uncorrected, the read-time clamp holds the sample.
    frozen.grid.frozenRows.set({ count: 3 });
    expect(scrollsOf(frozen.batches.at(-1)!)).toEqual([]);

    // At the logical top there is nothing to correct.
    frozen.grid.frozenRows.set({ count: 5 });
    expect(scrollsOf(frozen.batches.at(-1)!)).toEqual([]);

    // A resize re-resolves the count; it is not a freeze command.
    frozen.grid.setViewport(0, 0, WIDTH, 100);
    expect(scrollsOf(frozen.batches.at(-1)!)).toEqual([]);
    expect(regionsOf(frozen.batches.at(-1)!)).toMatchObject({ frozenCount: 1 });
  });

  it("writes the correction through the active touch override", async () => {
    const frozen = await createFrozenGrid(undefined);
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    frozen.grid.frozenRows.set({ count: 3 });
    frozen.grid.setViewport(200, 0, WIDTH, HEIGHT);
    frozen.grid.viewport.setTopOverride(200.5);

    frozen.grid.frozenRows.set({ count: 5 });

    // The synthetic scroller owns the sample: the correction moves it at
    // sub-pixel resolution and the anchor row stays at the clip top.
    expect(scrollsOf(frozen.batches.at(-1)!)).toEqual([136.5]);
    expect(frozen.grid.geometry.getVisibleRowWindow().start).toBe(9);
  });

  it("emits the ratio-scaled DOM top under compression", async () => {
    const grid = new GridCore<Row>({
      columns,
      dataSource: createColumnarDataSource({
        rowCount: 1_000_000,
        fields: [
          { field: "id", getValue: (row) => row },
          { field: "name", getValue: (row) => `Name ${row}` },
        ],
      }),
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      overscan: 10,
    });
    await grid.initialize();
    const batches = record(grid);
    grid.setViewport(0, 0, WIDTH, HEIGHT);
    grid.frozenRows.set({ count: 3 });
    grid.setViewport(4_000_000, 0, WIDTH, HEIGHT);
    expect(grid.viewport.isScaling()).toBe(true);

    grid.frozenRows.set({ count: 5 });

    const ratio = grid.viewport.getScrollRatio();
    const scrollTop = scrollsOf(batches.at(-1)!)[0]!;
    expect(ratio).toBeLessThan(1);
    expect(scrollTop).toBeLessThan(4_000_000);
    expect(scrollTop).toBeCloseTo(4_000_000 - 2 * ROW_HEIGHT * ratio, 3);
  });

  it("is a no-op after destroy", async () => {
    const frozen = await createFrozenGrid({ count: 3 });
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    const batches = frozen.batches.length;
    const events = frozen.events.length;

    frozen.grid.destroy();
    frozen.grid.frozenRows.set({ count: 8 });
    frozen.grid.frozenRows.freezeThrough(4);

    expect(frozen.batches).toHaveLength(batches);
    expect(frozen.events).toHaveLength(events);
    expect(frozen.grid.geometry.getRowRegions().frozenCount).toBe(3);
  });
});

describe("GridCore — the C12 open-edit rule", () => {
  const editableColumns: ColumnDefinition[] = [
    { field: "id", cellDataType: "number", width: 80 },
    { field: "name", cellDataType: "text", width: 200, editable: true },
  ];

  const createEditableGrid = async () => {
    const frozen = await createFrozenGrid({ count: 3 }, { columns: editableColumns });
    frozen.grid.setViewport(0, 0, WIDTH, HEIGHT);
    return frozen;
  };

  it("commits an edit whose row enters the prefix", async () => {
    const frozen = await createEditableGrid();
    expect(frozen.grid.edit.start(5, 1)).toBe(true);
    frozen.grid.edit.updateValue("Frozen", frozen.grid.edit.getState()!.editId);

    frozen.grid.frozenRows.freezeThrough(5);

    const batch = frozen.batches.at(-1)!;
    expect(batch.map(({ type }) => type)).toEqual(
      expect.arrayContaining(["COMMIT_EDIT", "STOP_EDIT", "ASSIGN_SLOT"]),
    );
    expect(batch.findLast((instruction) => instruction.type === "COMMIT_EDIT"))
      .toMatchObject({ row: 5, col: 1, value: "Frozen" });
    expect(frozen.grid.edit.getState()).toBeNull();
    expect(frozen.grid.cells.getValue(5, 1)).toBe("Frozen");
    expect(frozen.grid.geometry.getRowRegions().frozenCount).toBe(6);
  });

  it("commits an edit whose row leaves the prefix", async () => {
    const frozen = await createEditableGrid();
    expect(frozen.grid.edit.start(1, 1)).toBe(true);
    frozen.grid.edit.updateValue("Unfrozen", frozen.grid.edit.getState()!.editId);

    frozen.grid.frozenRows.set(undefined);

    expect(frozen.batches.at(-1)!.map(({ type }) => type)).toEqual(
      expect.arrayContaining(["COMMIT_EDIT", "STOP_EDIT"]),
    );
    expect(frozen.grid.edit.getState()).toBeNull();
    expect(frozen.grid.cells.getValue(1, 1)).toBe("Unfrozen");
    expect(frozen.grid.geometry.getRowRegions().frozenCount).toBe(0);
  });

  it("keeps the editor and draft when the row stays in its region", async () => {
    const frozen = await createEditableGrid();
    expect(frozen.grid.edit.start(1, 1)).toBe(true);
    const keptId = frozen.grid.edit.getState()!.editId;
    frozen.grid.edit.updateValue("Draft", keptId);

    frozen.grid.frozenRows.set({ count: 6 });

    expect(frozen.grid.edit.getState()).toMatchObject({
      row: 1,
      editId: keptId,
      currentValue: "Draft",
    });
    expect(frozen.batches.at(-1)!.some(({ type }) => type === "STOP_EDIT")).toBe(false);

    // A suffix row that stays a suffix row is untouched too.
    expect(frozen.grid.edit.start(20, 1)).toBe(true);
    const suffixId = frozen.grid.edit.getState()!.editId;
    frozen.grid.frozenRows.set({ count: 8 });
    expect(frozen.grid.edit.getState()?.editId).toBe(suffixId);
  });
});
