// packages/core/src/types/options.ts
// Grid options types

import type {
  RowId,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
} from "./basic";
import type { ColumnDefinition } from "./columns";
import type {
  ColumnMovedEvent,
  ColumnPinnedEvent,
  ColumnResizedEvent,
  RowDragEndEvent,
} from "./events";
import type { DataSource, DataSourceLoadMode } from "./data-source";
import type { ColumnLayoutMode, FrozenRowsState } from "./geometry";
import type { HighlightingOptions } from "./highlighting";
import type { GridLabelOverrides } from "../i18n";

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

/**
 * Frozen-row prefix configuration (C1). `count` is positional: the displayed
 * rows `[0, count)` stay below the header, and the request persists across
 * sort, filter and data changes. The effective count is derived from the row
 * count, `maxCount` and the viewport/cache limits; see `getFrozenRows`.
 */
export interface FreezeRowsOptions {
  /** Display indices `[0, count)`. Default: 0. */
  count: number;
  /** Upper bound applied before the viewport and cache limits. Default: 100. */
  maxCount?: number;
  /** CSS px of suffix viewport kept below the prefix. Default: 64. */
  minSuffixHeight?: number;
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
  /**
   * How displayed column widths are resolved. `"fit"` (default) expands
   * columns that have no explicit width override so their total reaches the
   * viewport; `"fixed"` always uses the declared/overridden pixel widths and
   * lets the grid scroll horizontally. Change at runtime with
   * `GridCore.setColumnLayout`.
   */
  columnLayout?: ColumnLayoutMode;
  /** Header height: Default to row height */
  headerHeight?: number;
  /** Overscan: How many rows to render outside the viewport */
  overscan?: number;
  /**
   * Extra center columns to mount per side, in CSS px, beyond the visible
   * center clip. Default: 240. Must be finite and non-negative.
   */
  columnOverscan?: number;
  /**
   * Maximum velocity (logical px/ms) that stacked touch flicks can
   * accumulate while scroll virtualization is active (datasets exceeding
   * the browser scroll limit). Higher values traverse huge datasets faster
   * but need a larger `overscan` (10–12 recommended) so rendering keeps up.
   * Default: 20 × rowHeight, i.e. about 20,000 rows per second.
   */
  maxFlingVelocity?: number;
  /** Row loading and cache behavior. Server data sources use paginated loading by default. */
  rowLoading?: RowLoadingOptions;
  /**
   * Frozen-row prefix. Creation-only: the request is resolved once, and
   * without it (or with `count: 0`) the grid renders the flat path.
   */
  freezeRows?: FreezeRowsOptions;
  /**
   * Called when the effective frozen count or its limit reason changes.
   * The first resolution is the baseline and never fires.
   */
  onFrozenRowsChanged?: (state: FrozenRowsState) => void;
  /** Overrides for the core's user-visible labels; defaults to English. */
  labels?: GridLabelOverrides;
  /** Enable/disable sorting globally. Default: true */
  sortingEnabled?: boolean;
  /** Function to extract unique ID from row. Required for mutations. */
  getRowId?: (row: TData) => RowId;
  /** Row/column/cell highlighting configuration */
  highlighting?: HighlightingOptions<TData>;
  /** Called when a cell value is changed via editing, fill drag, or paste. Requires getRowId. */
  onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
  /**
   * Called when a write is refused because the bound source is read-only.
   * The grid never emits a successful change event for a rejected write.
   */
  onWriteRejected?: (event: CellWriteRejectedEvent) => void;
  /** Whether clicking and dragging any cell in a row drags the entire row instead of starting selection. Default: false */
  rowDragEntireRow?: boolean;
  /** Called when a row is dropped after dragging. Consumer is responsible for data reordering. */
  onRowDragEnd?: (event: RowDragEndEvent) => void;
  /** Called when a column is resized. */
  onColumnResized?: (event: ColumnResizedEvent) => void;
  /** Called when a column is moved/reordered. */
  onColumnMoved?: (event: ColumnMovedEvent) => void;
  /**
   * Called after an explicit pin command, the header pin toggle or a
   * cross-region column drag changed a column's requested pin.
   */
  onColumnPinned?: (event: ColumnPinnedEvent) => void;
}
