// packages/core/src/types/renderers.ts
// Renderer parameter types

import type { CellValue, RowId, SortDirection } from "./basic";
import type { ColumnDefinition } from "./columns";
import type { ColumnPin } from "./geometry";

/**
 * Cell renderer params.
 *
 * `value` is the value the renderer should display. If the column declares a
 * `valueFormatter`, `value` is its output (a string); otherwise it's the raw
 * cell value. Use `getValue` to read another field's raw value.
 *
 * `rowData` is the source record for object sources and `undefined` for a
 * columnar source, which has no record. Renderers that must work for both
 * should read values through `getValue` and identity through `rowId`.
 */
export interface CellRendererParams<TData = unknown> {
  /** Post-formatter display value, or raw CellValue when no formatter is set */
  value: CellValue;
  /**
   * Source record, or `undefined` when the row has no materialized record
   * (columnar sources). Never allocated implicitly by the grid.
   */
  rowData: TData | undefined;
  /** Stable identity for the row, when the source exposes one. */
  rowId?: RowId;
  /** Normalized column identity: `colId ?? field`. */
  columnId: string;
  /**
   * Read another field's raw value at this row without requiring a record.
   * Defined for columnar rows and for object rows.
   */
  getValue?: (field: string) => CellValue;
  /** Column definition */
  column: ColumnDefinition;
  /** Row index */
  rowIndex: number;
  /** Column index */
  colIndex: number;
  /** Is active cell */
  isActive: boolean;
  /** Is selected cell */
  isSelected: boolean;
  /** Is editing cell */
  isEditing: boolean;
}

/** Edit renderer params */
export interface EditRendererParams<TData = unknown>
  extends CellRendererParams<TData> {
  /** Initial value */
  initialValue: CellValue;
  /** On value change */
  onValueChange: (newValue: CellValue) => void;
  /** On commit */
  onCommit: () => void;
  /** On cancel */
  onCancel: () => void;
}

/** Header renderer params */
export interface HeaderRendererParams {
  /** Column definition */
  column: ColumnDefinition;
  /** Normalized column identity: `colId ?? field`. */
  columnId: string;
  /** Column index */
  colIndex: number;
  /** Sort direction */
  sortDirection?: SortDirection;
  /** Sort index */
  sortIndex?: number;
  /** Whether column is sortable */
  sortable: boolean;
  /** Whether column is filterable */
  filterable: boolean;
  /** Whether column has an active filter */
  hasFilter: boolean;
  /** Requested pin of the header's column, or `null` while unpinned. */
  pinned: ColumnPin | null;
  /** On sort */
  onSort: (direction: SortDirection | null, addToExisting: boolean) => void;
  /** On filter click */
  onFilterClick: () => void;
  /** Request a pin change; `null` unpins. */
  onPinChange: (pinned: ColumnPin | null) => void;
}
