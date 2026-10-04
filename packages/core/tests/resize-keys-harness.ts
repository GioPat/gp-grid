// packages/core/tests/resize-keys-harness.ts
// Shared fixture for the resize-key suites: 50 client rows under a mixed
// column layout, and the key events the grid receives.

import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type {
  AutoFitOptions,
  CellPosition,
  ColumnDefinition,
  ColumnResizedEvent,
  RowResizedEvent,
} from "../src/types";
import type { KeyEventData } from "../src/types/input";

export interface Row {
  id: number;
}

export const ROW_HEIGHT = 32;

// Layout indices: s 0 (start pin), a 1, b 2, h 3 (hidden), c 4, d 5, e 6 (end pin).
export const allColumns = (): ColumnDefinition[] => [
  { field: "s", cellDataType: "text", width: 100, pinned: "start" },
  { field: "a", cellDataType: "text", width: 100, movable: false },
  { field: "b", cellDataType: "text", width: 100, minWidth: 60, maxWidth: 124 },
  { field: "h", cellDataType: "text", width: 100, hidden: true },
  { field: "c", cellDataType: "text", width: 100, resizable: false },
  { field: "d", cellDataType: "text", width: 100 },
  { field: "e", cellDataType: "text", width: 100, pinned: "end" },
];

export interface HarnessOptions {
  columns?: ColumnDefinition[];
  autoFit?: AutoFitOptions;
  rowResize?: boolean;
}

export const createGrid = async (options: HarnessOptions = {}) => {
  const rowEvents: RowResizedEvent[] = [];
  const columnEvents: ColumnResizedEvent[] = [];
  const grid = new GridCore<Row>({
    columns: options.columns ?? allColumns(),
    dataSource: createClientDataSource(Array.from({ length: 50 }, (_, id) => ({ id }))),
    rowHeight: ROW_HEIGHT,
    columnLayout: "fixed",
    getRowId: (row) => row.id,
    autoFit: options.autoFit,
    rowResize: options.rowResize ?? true,
    onRowResized: (event) => rowEvents.push(event),
    onColumnResized: (event) => columnEvents.push(event),
  });
  await grid.initialize();
  grid.setViewport(0, 0, 1_000, 320);
  return { grid, rowEvents, columnEvents };
};

export const key = (name: string, modifiers: Partial<KeyEventData> = {}): KeyEventData => ({
  key: name,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  ...modifiers,
});

export const alt = (name: string, shiftKey = false): KeyEventData => key(name, { altKey: true, shiftKey });

export const press = (grid: GridCore<Row>, event: KeyEventData, editing: CellPosition | null = null) =>
  grid.input.handleKeyDown(event, grid.selection.getActiveCell(), editing, false);

export const widthOf = (grid: GridCore<Row>, columnId: string): number | undefined =>
  grid.columns.getState().find((state) => state.columnId === columnId)?.resolvedWidth;

export const heightAt = (grid: GridCore<Row>, viewIndex: number): number => {
  const bounds = grid.geometry.getRowBounds(viewIndex, "content");
  return bounds === undefined ? 0 : bounds.end - bounds.start;
};

export const displayedIds = (grid: GridCore<Row>): string[] =>
  grid.geometry.getColumnLayout().columns.map((column) => column.columnId);
