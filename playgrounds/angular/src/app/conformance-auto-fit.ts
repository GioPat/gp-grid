// playgrounds/angular/src/app/conformance-auto-fit.ts
// Row resize and fit conformance fixture (PRD 007). Fixture logic lives here
// so the shared conformance app does not grow past its budget.

import { createServerDataSource } from '@gp-grid/angular';
import type {
  ColumnDefinition,
  ColumnLayoutMode,
  DataSource,
  RowLoadingOptions,
} from '@gp-grid/angular';
import type { RequestedRange } from './conformance-geometry';

/** `off` keeps the fixture's own grid; the others arm the fit fixture. */
export type AutoFitMode = 'off' | 'object' | 'paged';

/** Slice 1 recipe: 32 px rows, 36 px header, fixed widths. */
export const AUTO_FIT_ROW_HEIGHT = 32;
export const AUTO_FIT_HEADER_HEIGHT = 36;
export const AUTO_FIT_COLUMN_LAYOUT: ColumnLayoutMode = 'fixed';
export const AUTO_FIT_ROW_COUNT = 1000;
export const AUTO_FIT_PAGE_SIZE = 100;
/** Row 3's 60-character name is wider than the `name` column's maximum. */
export const AUTO_FIT_LONG_NAME = 'Row 003 '.padEnd(60, 'wide ');

export interface AutoFitRow {
  id: number;
  name: string;
  notes: string;
  summary: string;
  c0: number;
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
  c6: number;
  c7: number;
}

/** Notes wrap onto 1 to 17 repetitions, so the rows fit to different heights. */
const createAutoFitRow = (index: number): AutoFitRow => ({
  id: index,
  name: index === 3 ? AUTO_FIT_LONG_NAME : `Row ${index.toString().padStart(3, '0')}`,
  notes: 'lorem ipsum '.repeat(1 + (index % 5) * 4),
  summary: `Summary ${index}`,
  c0: index * 8,
  c1: index * 8 + 1,
  c2: index * 8 + 2,
  c3: index * 8 + 3,
  c4: index * 8 + 4,
  c5: index * 8 + 5,
  c6: index * 8 + 6,
  c7: index * 8 + 7,
});

const createNumberColumns = (): ColumnDefinition[] =>
  Array.from({ length: 8 }, (_, index) => ({
    colId: `c${index}`,
    field: `c${index}`,
    headerName: `C${index}`,
    width: 120,
    cellDataType: 'number' as const,
  }));

/** `id` and `summary` are pinned; `name` is editable so its cells carry the fill handle. */
const createAutoFitColumns = (): ColumnDefinition[] => [
  { colId: 'id', field: 'id', headerName: 'ID', width: 80, cellDataType: 'number', pinned: 'start' },
  { colId: 'name', field: 'name', headerName: 'Name', width: 120, maxWidth: 300, cellDataType: 'text', editable: true },
  { colId: 'notes', field: 'notes', headerName: 'Notes', width: 220, wrapText: true, cellDataType: 'text' },
  ...createNumberColumns(),
  { colId: 'summary', field: 'summary', headerName: 'Summary', width: 160, cellDataType: 'text', pinned: 'end' },
];

export interface AutoFitFixture {
  columnsFor(mode: AutoFitMode): ColumnDefinition[] | undefined;
  sourceFor(mode: AutoFitMode): DataSource<never> | undefined;
  /** The object arm's rows; `undefined` for the paged arm. */
  rowDataFor(mode: AutoFitMode): AutoFitRow[] | undefined;
  rowLoadingFor(mode: AutoFitMode): RowLoadingOptions | undefined;
  /** Ranges the paged source was asked for, in request order (AC-007-04). */
  requestedRanges(): RequestedRange[];
}

export const createAutoFitFixture = (): AutoFitFixture => {
  const requests: RequestedRange[] = [];
  // The 006 paged pattern over this fixture's rows: 100-row pages, no
  // prefetch, identity from the grid's own `getRowId`.
  const pagedSource = createServerDataSource<AutoFitRow | undefined>(async (request) => {
    const { startRow, endRow } = request.range;
    requests.push({ startRow, endRow });
    const end = Math.min(endRow, AUTO_FIT_ROW_COUNT);
    const rows = Array.from(
      { length: Math.max(0, end - startRow) },
      (_, offset) => createAutoFitRow(startRow + offset),
    );
    return { rows, totalRows: AUTO_FIT_ROW_COUNT };
  });

  const objectRows = Array.from({ length: AUTO_FIT_ROW_COUNT }, (_, index) => createAutoFitRow(index));
  const columns = createAutoFitColumns();
  const pagedLoading: RowLoadingOptions = {
    cache: { pageSize: AUTO_FIT_PAGE_SIZE, prefetchPages: 0 },
  };

  return {
    columnsFor: (mode) => (mode === 'off' ? undefined : columns),
    sourceFor: (mode) => (mode === 'paged' ? (pagedSource as DataSource<never>) : undefined),
    rowDataFor: (mode) => (mode === 'object' ? objectRows : undefined),
    rowLoadingFor: (mode) => (mode === 'paged' ? pagedLoading : undefined),
    requestedRanges: () => requests,
  };
};
