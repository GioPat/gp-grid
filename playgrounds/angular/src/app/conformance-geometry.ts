// playgrounds/angular/src/app/conformance-geometry.ts
// Geometry hooks and column sets for the geometry conformance suite. Kept out
// of the fixture component so the fixture file does not grow past its budget.

import { createColumnarDataSource } from '@gp-grid/angular';
import type { CellPosition, CellRange, ColumnDefinition, GridCore, RowId } from '@gp-grid/angular';

/** Narrow columns whose declared total is far below the host width. */
export const createNarrowColumns = (): ColumnDefinition[] => [
  { colId: 'id', field: 'id', headerName: 'ID', width: 100, cellDataType: 'number', sortable: true },
  { colId: 'name', field: 'name', headerName: 'Name', width: 120, cellDataType: 'text', sortable: true, editable: true },
  { colId: 'city', field: 'city', headerName: 'City', width: 140, cellDataType: 'text' },
];

export const LARGE_COLUMNAR_ROW_COUNT = 1_000_000;

/**
 * Deterministic unequal widths (80/100/120/140/160 cycling) so a wide fixture
 * exercises the prefix-axis window instead of a uniform grid.
 */
export const createWideColumns = (count: number): ColumnDefinition[] =>
  Array.from({ length: count }, (_, index) => ({
    colId: `w${index}`,
    field: `w${index}`,
    headerName: `W${index}`,
    width: 80 + (index % 5) * 20,
    cellDataType: 'number' as const,
    sortable: true,
  }));

/** Accessor-backed wide source: no per-row storage, so 10,000 columns bind fast. */
export const createWideSource = (count: number) =>
  createColumnarDataSource({
    rowCount: 200,
    getRowId: (row) => row,
    fields: Array.from({ length: count }, (_, index) => ({
      field: `w${index}`,
      getValue: (row: number) => row * count + index,
    })),
  });

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
    cellDataType: 'number' as const,
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

/** Compact projection of the published column window, for the pinning suite. */
export interface ColumnWindowView {
  range: { start: number; end: number };
  start: string[];
  center: string[];
  end: string[];
  regions: {
    centerStart: number;
    centerEnd: number;
    startWidth: number;
    endWidth: number;
    endOffset: number;
    centerViewportWidth: number;
  };
  displayedCount: number;
}

export interface GeometryHooks {
  layoutColumns: () => LayoutColumnSnapshot[];
  cellBounds: (row: number, layoutIndex: number) => CellBoundsSnapshot | null;
  identityBounds: (rowId: RowId, columnId: string) => CellBoundsSnapshot | null;
  activeCell: () => CellPosition | null;
  selectionRange: () => CellRange | null;
  columnWindow: () => ColumnWindowView | null;
  /** Activate a cell and scroll it into view; LTR-only, like the pinning suite. */
  activateCell: (row: number, layoutIndex: number) => void;
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
  selectionRange: () => getCore()?.selection.getSelectionRange() ?? null,
  activateCell: (row, layoutIndex) => {
    const core = getCore();
    const body = document.querySelector<HTMLElement>(".gp-grid-rows-wrapper")
      ?.parentElement?.parentElement ?? null;
    if (!core || body === null) return;
    core.selection.setActiveCell(row, layoutIndex);
    // LTR-only: physical and logical scrollLeft agree, so the sample passes through.
    const target = core.geometry.getScrollTarget(row, layoutIndex, {
      scrollTop: body.scrollTop,
      scrollLeft: body.scrollLeft,
    });
    if (target.scrollTop !== undefined) body.scrollTop = target.scrollTop;
    if (target.scrollLeft !== undefined) body.scrollLeft = target.scrollLeft;
  },
  columnWindow: () => {
    const snapshot = getCore()?.geometry.getColumnWindow() ?? null;
    if (snapshot === null) return null;
    const ids = (columns: readonly { columnId: string }[]): string[] =>
      columns.map((column) => column.columnId);
    return {
      range: { start: snapshot.range.start, end: snapshot.range.end },
      start: ids(snapshot.start),
      center: ids(snapshot.center),
      end: ids(snapshot.end),
      regions: { ...snapshot.layout.regions },
      displayedCount: snapshot.layout.columns.length,
    };
  },
});
