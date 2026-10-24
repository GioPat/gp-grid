// playgrounds/angular/src/app/conformance-row-heights.ts
// Row-height conformance fixture (PRD 006). Fixture logic lives here so the
// shared conformance app does not grow past its budget.

import { createServerDataSource } from '@gp-grid/angular';
import type {
  ColumnDefinition,
  DataSource,
  GridCore,
  RowHeightUpdate,
  RowLoadingOptions,
} from '@gp-grid/angular';
import {
  createLargeColumnarColumns,
  createLargeColumnarSource,
  LARGE_COLUMNAR_ROW_COUNT,
  type RequestedRange,
} from './conformance-geometry';


/** `off` keeps the fixture's own grid; the others arm a height fixture. */
export type RowHeightsMode = 'off' | 'object' | 'large' | 'paged';

/** Slice 1 recipe: 32 px rows, 36 px header. */
export const ROW_HEIGHTS_ROW_HEIGHT = 32;
export const ROW_HEIGHTS_HEADER_HEIGHT = 36;
export const ROW_HEIGHTS_ROW_COUNT = 1000;
export const ROW_HEIGHTS_PAGE_SIZE = 100;
/** The paged arm's override: its row sits many pages below the first window. */
export const ROW_HEIGHTS_PAGED_ID = 5000;
/** AC-006-04 growth: one row grows by 80 px above the viewport. */
export const ROW_HEIGHTS_GROWTH = 80;
/** The frozen control sets ID 1 to this, growing a three-row band by 64. */
export const ROW_HEIGHTS_FROZEN_HEIGHT = 96;
/** The large arm's last row carries the 480 px override. */
export const ROW_HEIGHTS_LAST_ID = LARGE_COLUMNAR_ROW_COUNT - 1;
/** The object arm's ID that sorts first, so AC-006-03 knows where it lands. */
export const ROW_HEIGHTS_FIRST_SORTED_ID = 10;

export interface RowHeightsRow {
  id: number;
  name: string;
  city: string;
  score: number;
  team: string;
  status: string;
  note: string;
  code: string;
}

/** Stable identity comes from `id`; the shared score sort moves ID 10 to index 0. */
export const createRowHeightsRows = (): RowHeightsRow[] =>
  Array.from({ length: ROW_HEIGHTS_ROW_COUNT }, (_, index) => ({
    id: index,
    name: `Row ${index.toString().padStart(3, '0')}`,
    city: `City ${index % 11}`,
    score: index === ROW_HEIGHTS_FIRST_SORTED_ID ? -1 : index * 3,
    team: `Team ${index % 7}`,
    status: index % 2 === 0 ? 'active' : 'inactive',
    note: `Note ${index}`,
    code: `C-${index.toString().padStart(4, '0')}`,
  }));

/** The apps' own field names, so the shared `apply-sort` control reaches `score`. */
const OBJECT_FIELDS = ['id', 'name', 'city', 'score', 'team', 'status', 'note', 'code'] as const;

const createObjectColumns = (): ColumnDefinition[] =>
  OBJECT_FIELDS.map((field) => ({
    colId: field,
    field,
    headerName: field,
    width: 100,
    cellDataType: field === 'id' || field === 'score' ? 'number' : 'text',
    sortable: true,
  }));

/** Matches the columnar source: row `r`, column `c` reads `r * 8 + c`. */
type PagedRow = Record<string, number>;
const createPagedRow = (index: number): PagedRow => {
  const row: PagedRow = { id: index };
  for (let column = 0; column < 8; column += 1) {
    row[`c${column}`] = index * 8 + column;
  }
  return row;
};

/** Heights each arm sets through the core handle right after mount (D1, D2). */
export const ROW_HEIGHTS_PRESETS: Record<RowHeightsMode, readonly RowHeightUpdate[]> = {
  off: [],
  object: [],
  large: [
    { rowId: 1, height: 64 },
    { rowId: 2, height: 96 },
    { rowId: ROW_HEIGHTS_LAST_ID, height: 480 },
  ],
  paged: [{ rowId: ROW_HEIGHTS_PAGED_ID, height: 96 }],
};

export interface RowHeightsFixture {
  columnsFor(mode: RowHeightsMode): ColumnDefinition[] | undefined;
  sourceFor(mode: RowHeightsMode): DataSource<never> | undefined;
  /** The object arm's rows; `undefined` for the sourced arms. */
  rowDataFor(mode: RowHeightsMode): RowHeightsRow[] | undefined;
  rowLoadingFor(mode: RowHeightsMode): RowLoadingOptions | undefined;
  /** Ranges the paged source was asked for, in request order (AC-006-05). */
  requestedRanges(): RequestedRange[];
  /** Arm presets, applied once the armed core exists. */
  applyPreset(core: GridCore<unknown>, mode: RowHeightsMode): void;
  /** IDs 2 → 96, 10 → 64, 50 → 128 (AC-006-01, AC-006-03). */
  setControlHeights(core: GridCore<unknown>): void;
  /** +80 px on the row five above the first visible one (AC-006-04). */
  growAboveViewport(core: GridCore<unknown>): void;
  /** Freeze 3 rows, then ID 1 → 96 (AC-006-04 frozen). */
  growFrozenRow(core: GridCore<unknown>): void;
  resetHeights(core: GridCore<unknown>): void;
}

export const createRowHeightsFixture = (): RowHeightsFixture => {
  const requests: RequestedRange[] = [];
  // Identity comes from the grid's own `getRowId` option on a paginated
  // source; the paged rows carry `id` = their source row index.
  const pagedSource = createServerDataSource<PagedRow | undefined>(async (request) => {
    const { startRow, endRow } = request.range;
    requests.push({ startRow, endRow });
    const end = Math.min(endRow, LARGE_COLUMNAR_ROW_COUNT);
    const rows = Array.from(
      { length: Math.max(0, end - startRow) },
      (_, offset) => createPagedRow(startRow + offset),
    );
    return { rows, totalRows: LARGE_COLUMNAR_ROW_COUNT };
  });

  const objectRows = createRowHeightsRows();
  const objectColumns = createObjectColumns();
  const columnar = createLargeColumnarSource();
  const columnarColumns = createLargeColumnarColumns();
  const pagedLoading: RowLoadingOptions = {
    cache: { pageSize: ROW_HEIGHTS_PAGE_SIZE, prefetchPages: 0 },
  };

  const sizeOf = (core: GridCore<unknown>, viewIndex: number): number => {
    const bounds = core.geometry.getRowBounds(viewIndex, 'content');
    return bounds === undefined ? ROW_HEIGHTS_ROW_HEIGHT : bounds.end - bounds.start;
  };

  const columnsFor = (mode: RowHeightsMode): ColumnDefinition[] | undefined => {
    if (mode === 'object') return objectColumns;
    if (mode === 'off') return undefined;
    return columnarColumns;
  };

  const sourceFor = (mode: RowHeightsMode): DataSource<never> | undefined => {
    if (mode === 'large') return columnar;
    if (mode === 'paged') return pagedSource as DataSource<never>;
    return undefined;
  };

  return {
    columnsFor,
    sourceFor,
    rowDataFor: (mode) => (mode === 'object' ? objectRows : undefined),
    rowLoadingFor: (mode) => (mode === 'paged' ? pagedLoading : undefined),
    requestedRanges: () => requests,
    applyPreset: (core, mode) => core.rowHeights.set(ROW_HEIGHTS_PRESETS[mode]),
    setControlHeights: (core) =>
      core.rowHeights.set([
        { rowId: 2, height: 96 },
        { rowId: ROW_HEIGHTS_FIRST_SORTED_ID, height: 64 },
        { rowId: 50, height: 128 },
      ]),
    growAboveViewport: (core) => {
      const first = core.geometry.getVisibleRowWindow().start;
      const target = Math.max(0, first - 5);
      core.rowHeights.set([
        { rowId: target, height: sizeOf(core, target) + ROW_HEIGHTS_GROWTH },
      ]);
    },
    growFrozenRow: (core) => {
      core.frozenRows.set({ count: 3 });
      core.rowHeights.set([{ rowId: 1, height: ROW_HEIGHTS_FROZEN_HEIGHT }]);
    },
    resetHeights: (core) => core.rowHeights.reset(),
  };
};
