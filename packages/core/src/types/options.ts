// packages/core/src/types/options.ts
// Grid options types

import type { RowId, CellValueChangedEvent } from "./basic";
import type { ColumnDefinition } from "./columns";
import type { DataSource } from "./data-source";
import type { HighlightingOptions } from "./highlighting";

export interface RowGroupingOptions {
  /** Column fields or colIds used as hierarchical grouping levels. */
  columns: string[];
  /** Groups with depth lower than this value start expanded. Default: all collapsed. */
  defaultExpandedDepth?: number;
  /** Controlled/initial expanded group keys. */
  expandedGroups?: string[];
}

/** Grid core options */
export interface GridCoreOptions<TData = unknown> {
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
  /** Client-side row grouping configuration. */
  rowGrouping?: RowGroupingOptions;
  /** Called when a row group is expanded or collapsed. */
  onRowGroupExpandedChange?: (groupKey: string, expanded: boolean) => void;
}
