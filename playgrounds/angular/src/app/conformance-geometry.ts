// playgrounds/angular/src/app/conformance-geometry.ts
// Geometry hooks and column sets for the geometry conformance suite. Kept out
// of the fixture component so the fixture file does not grow past its budget.

import { createColumnarDataSource } from '@gp-grid/angular';
import type { CellPosition, ColumnDefinition, GridCore, RowId } from '@gp-grid/angular';

/** Narrow columns whose declared total is far below the host width. */
export const createNarrowColumns = (): ColumnDefinition[] => [
  { colId: 'id', field: 'id', headerName: 'ID', width: 100, cellDataType: 'number', sortable: true },
  { colId: 'name', field: 'name', headerName: 'Name', width: 120, cellDataType: 'text', sortable: true, editable: true },
  { colId: 'city', field: 'city', headerName: 'City', width: 140, cellDataType: 'text' },
];

export const LARGE_COLUMNAR_ROW_COUNT = 1_000_000;

/**
 * Eight 100 px columns overflow the 600 px fixture host, so keyboard
 * navigation must move the horizontal axis as well as the vertical one.
 */
export const createLargeColumnarColumns = (): ColumnDefinition[] =>
  Array.from({ length: 8 }, (_, index) => ({
    colId: `c${index}`,
    field: `c${index}`,
    headerName: `C${index}`,
    width: 100,
    cellDataType: "number" as const,
    sortable: true,
  }));

/**
 * Accessor-backed source: no per-row storage is allocated, so a million rows
 * bind in O(columns).
 */
export const createLargeColumnarSource = () =>
  createColumnarDataSource({
    rowCount: LARGE_COLUMNAR_ROW_COUNT,
    getRowId: (row) => row,
    fields: Array.from({ length: 8 }, (_, index) => ({
      field: `c${index}`,
      getValue: (row: number) => row * 8 + index,
    })),
  });

export interface LayoutColumnSnapshot {
  columnId: string;
  layoutIndex: number;
  offset: number;
  width: number;
}

export interface CellBoundsSnapshot {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface GeometryHooks {
  layoutColumns: () => LayoutColumnSnapshot[];
  cellBounds: (row: number, layoutIndex: number) => CellBoundsSnapshot | null;
  identityBounds: (rowId: RowId, columnId: string) => CellBoundsSnapshot | null;
  activeCell: () => CellPosition | null;
}

const boundsOf = (
  bounds: { top: number; left: number; width: number; height: number } | undefined,
): CellBoundsSnapshot | null =>
  bounds === undefined
    ? null
    : { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height };

/**
 * Geometry hooks address a cell by layout index, the index space of
 * `CellPosition.col`; identity lookups go through `getCellBounds` instead.
 */
export const createGeometryHooks = (
  getCore: () => GridCore<unknown> | null,
): GeometryHooks => ({
  layoutColumns: () =>
    (getCore()?.geometry.getColumnLayout().columns ?? []).map((column) => ({
      columnId: column.columnId,
      layoutIndex: column.layoutIndex,
      offset: column.offset,
      width: column.width,
    })),
  cellBounds: (row, layoutIndex) =>
    boundsOf(getCore()?.geometry.getCellBounds(row, layoutIndex, 'viewport')),
  identityBounds: (rowId, columnId) =>
    boundsOf(getCore()?.getCellBounds(rowId, columnId, 'viewport')),
  activeCell: () => getCore()?.selection.getActiveCell() ?? null,
});
