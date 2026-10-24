// playgrounds/vite-vue/src/conformance-frozen.ts
// Frozen-row conformance fixture (PRD 005). Fixture logic lives here so the
// shared conformance app does not grow past its budget.

import { createServerDataSource } from "@gp-grid/vue";
import type {
  ColumnDefinition,
  ColumnStateUpdate,
  DataSource,
  FreezeRowsOptions,
  FrozenRowsState,
  GridAnnouncement,
  GridCore,
  GridInstruction,
  RowLoadingOptions,
} from "@gp-grid/vue";
import {
  createLargeColumnarColumns,
  createLargeColumnarSource,
  LARGE_COLUMNAR_ROW_COUNT,
  type RequestedRange,
} from "./conformance-geometry";

/** `off` keeps the fixture's own grid; the others arm a frozen one. */
export type FrozenMode = "off" | "columnar" | "paged" | "paged-tight" | "object";

/** Slice 1 recipe: 8 x 100 px columns, 32 px rows, `c0`/`c7` pinned. */
export const FROZEN_ROW_HEIGHT = 32;
export const FROZEN_HEADER_HEIGHT = 36;
export const FROZEN_COUNT = 3;
export const FROZEN_BLOCK_HEIGHT = FROZEN_COUNT * FROZEN_ROW_HEIGHT;
export const FROZEN_PAGE_SIZE = 100;
export const FROZEN_HOST_HEIGHT = 360;
/** The AC-005-05 narrow host: one frozen row fits above the 64 px suffix. */
export const FROZEN_HOST_NARROW_HEIGHT = 160;

type PagedRow = Record<string, number>;
export const NO_ROW_LOADING: RowLoadingOptions = {};

/** Matches the columnar source: row `r`, column `c` reads `r * 8 + c`. */
const createPagedRow = (index: number): PagedRow => {
  const row: PagedRow = { id: index };
  for (let column = 0; column < 8; column += 1) {
    row[`c${column}`] = index * 8 + column;
  }
  return row;
};

/** Fields of the conformance apps' own object rows, in column order. */
const OBJECT_FIELDS = ["id", "name", "city", "score", "team", "status", "note", "code"] as const;

/**
 * Writable arm: the same 8 x 100 px columns over the apps' object rows, with
 * `c0` as the row-drag handle and `c1` as the only editable text column.
 */
const createFrozenObjectColumns = (): ColumnDefinition[] =>
  OBJECT_FIELDS.map((field, index) => ({
    colId: `c${index}`,
    field,
    headerName: `C${index}`,
    width: 100,
    cellDataType: field === "id" || field === "score" ? "number" : "text",
    editable: field === "name",
    rowDrag: field === "id",
  }));

export interface FrozenFixture {
  readonly columnState: ColumnStateUpdate[];
  columnsFor(mode: FrozenMode): ColumnDefinition[] | undefined;
  sourceFor(mode: FrozenMode): DataSource<never> | undefined;
  rowLoadingFor(mode: FrozenMode): RowLoadingOptions | undefined;
  freezeRowsFor(mode: FrozenMode): FreezeRowsOptions | undefined;
  /** Ranges the paginated sources were asked for, in request order. */
  requestedRanges(): RequestedRange[];
  /** Latest C13 announcement the core published. */
  announcement(): GridAnnouncement | null;
  /** C9 events the three apps forwarded from `onFrozenRowsChanged`, in order. */
  freezeEvents(): FrozenRowsState[];
  /** `onFrozenRowsChanged` sink the three apps pass or emit into. */
  recordFreezeEvent(state: FrozenRowsState): void;
  /** Withhold rows `[0, count)` from the next prefix response (C7 placeholder). */
  holdFrozenRows(): void;
  /** Re-subscribe after a remount; every arm rebuilds the core. */
  track(core: GridCore<unknown> | null): void;
}

export const createFrozenFixture = (): FrozenFixture => {
  const requests: RequestedRange[] = [];
  const events: FrozenRowsState[] = [];
  let hold = false;
  const consumeHold = (): boolean => {
    const armed = hold;
    hold = false;
    return armed;
  };

  const createPagedSource = (): DataSource<PagedRow | undefined> =>
    createServerDataSource<PagedRow | undefined>(async (request) => {
      const { startRow, endRow } = request.range;
      requests.push({ startRow, endRow });
      const end = Math.min(endRow, LARGE_COLUMNAR_ROW_COUNT);
      const withhold = startRow === 0 && consumeHold();
      const rows = Array.from(
        { length: Math.max(0, end - startRow) },
        (_, offset) => {
          const index = startRow + offset;
          return withhold && index < FROZEN_COUNT ? undefined : createPagedRow(index);
        },
      );
      return { rows, totalRows: LARGE_COLUMNAR_ROW_COUNT };
    });

  const columnar = createLargeColumnarSource();
  const paged = createPagedSource();
  const tight = createPagedSource();
  const columnarColumns = createLargeColumnarColumns();
  const objectColumns = createFrozenObjectColumns();
  const columnState: ColumnStateUpdate[] = [
    { columnId: "c0", pinned: "start" },
    { columnId: "c7", pinned: "end" },
  ];
  const freezeRows: FreezeRowsOptions = { count: FROZEN_COUNT };
  const pagedLoading: RowLoadingOptions = {
    cache: { pageSize: FROZEN_PAGE_SIZE, prefetchPages: 0 },
  };
  const tightLoading: RowLoadingOptions = {
    cache: { pageSize: FROZEN_PAGE_SIZE, prefetchPages: 0, maxPages: 1 },
  };

  let announcement: GridAnnouncement | null = null;
  let unsubscribe: (() => void) | null = null;

  // `never` keeps a fixture source assignable to whatever row type the app
  // declares; the grid reads these records through the `unknown` hooks.
  const sourceFor = (mode: FrozenMode): DataSource<never> | undefined => {
    if (mode === "columnar") return columnar;
    if (mode === "paged") return paged as DataSource<never>;
    if (mode === "paged-tight") return tight as DataSource<never>;
    return undefined;
  };

  const columnsFor = (mode: FrozenMode): ColumnDefinition[] | undefined => {
    if (mode === "object") return objectColumns;
    if (mode === "off") return undefined;
    return columnarColumns;
  };

  const rowLoadingFor = (mode: FrozenMode): RowLoadingOptions | undefined => {
    if (mode === "paged") return pagedLoading;
    if (mode === "paged-tight") return tightLoading;
    return undefined;
  };

  return {
    columnState,
    columnsFor,
    sourceFor,
    rowLoadingFor,
    freezeRowsFor: (mode) => (mode === "off" ? undefined : freezeRows),
    requestedRanges: () => requests,
    announcement: () => announcement,
    freezeEvents: () => events,
    recordFreezeEvent: (state) => {
      events.push(state);
    },
    holdFrozenRows: () => {
      hold = true;
    },
    track: (core) => {
      unsubscribe?.();
      unsubscribe = core?.onBatchInstruction((batch: readonly GridInstruction[]) => {
        for (const instruction of batch) {
          if (instruction.type === "SET_ANNOUNCEMENT") {
            announcement = instruction.announcement;
          }
        }
      }) ?? null;
    },
  };
};
