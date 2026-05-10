// packages/core/src/types/options.ts
// Grid options types

import type { RowId, CellValueChangedEvent } from "./basic";
import type { ColumnDefinition } from "./columns";
import type { DataSource, DataSourceLoadMode } from "./data-source";
import type { HighlightingOptions } from "./highlighting";

/** Row loading mode used by GridCore. "auto" follows the data source preference. */
export type RowLoadingMode = "auto" | DataSourceLoadMode;

/** Preset for how quickly paginated rows are evicted from memory. */
export type RowCacheEviction = "aggressive" | "balanced" | "conservative";

/** Cache controls for paginated row loading. */
export interface RowCacheOptions {
  /** Rows per server request. Default: 100. */
  pageSize?: number;
  /** Pages to prefetch before and after the visible page. Default depends on eviction preset. */
  prefetchPages?: number;
  /** Maximum loaded pages kept in memory. Default depends on eviction preset. */
  maxPages?: number;
  /** Eviction preset. Default: "balanced". */
  eviction?: RowCacheEviction;
}

/** Grid row loading options. */
export interface RowLoadingOptions {
  /** Loading mode. Default: "auto". */
  mode?: RowLoadingMode;
  /** Cache options used when paginated loading is active. */
  cache?: RowCacheOptions;
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
  /** Row loading and cache behavior. Server data sources use paginated loading by default. */
  rowLoading?: RowLoadingOptions;
  /** Enable/disable sorting globally. Default: true */
  sortingEnabled?: boolean;
  /** Debounce time for transactions in ms. Default 50. Set to 0 for sync. */
  transactionDebounceMs?: number;
  /** Function to extract unique ID from row. Required for mutations. */
  getRowId?: (row: TData) => RowId;
  /** Row/column/cell highlighting configuration */
  highlighting?: HighlightingOptions<TData>;
  /** Called when a cell value is changed via editing, fill drag, or paste. Requires getRowId. */
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
