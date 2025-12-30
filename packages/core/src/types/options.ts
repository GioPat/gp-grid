// packages/core/src/types/options.ts
// Grid options types

import type { Row, RowId } from "./basic";
import type { ColumnDefinition } from "./columns";
import type { DataSource } from "./data-source";

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
}
