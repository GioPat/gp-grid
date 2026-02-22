// packages/core/src/types/options.ts
// Grid options types

import type { Row, RowId, CellValueChangedEvent } from "./basic";
import type { ColumnDefinition } from "./columns";
import type { DataSource } from "./data-source";
import type { HighlightingOptions } from "./highlighting";

/** Grid core options */
export interface GridCoreOptions<TData = Row> {
  /** Column definitions */
  columns: ColumnDefinition[];
  /** Data source */
  dataSource: DataSource<TData>;
  /** Row height */
  rowHeight: number;
  /** Header height: Default to row height */
  headerHeight?: number;
  /** Overscan: How many rows to render outside the viewport */
  overscan?: number;
  /** Enable/disable sorting globally. Default: true */
  sortingEnabled?: boolean;
  /** Debounce time for transactions in ms. Default 50. Set to 0 for sync. */
  transactionDebounceMs?: number;
  /** Function to extract unique ID from row. Required for mutations. */
  getRowId?: (row: TData) => RowId;
  /** Row/column/cell highlighting configuration */
  highlighting?: HighlightingOptions<TData>;
  /** Called when a cell value is changed via editing or fill drag. Requires getRowId. */
  onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
  /** Whether clicking and dragging any cell in a row drags the entire row instead of starting selection. Default: false */
  rowDragEntireRow?: boolean;
  /** Called when a row is dropped after dragging. Consumer is responsible for data reordering. */
  onRowDragEnd?: (sourceIndex: number, targetIndex: number) => void;
  /** Called when a column is resized. */
  onColumnResized?: (colIndex: number, newWidth: number) => void;
  /** Called when a column is moved/reordered. */
  onColumnMoved?: (fromIndex: number, toIndex: number) => void;
}
