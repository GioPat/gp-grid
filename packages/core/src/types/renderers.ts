// packages/core/src/types/renderers.ts
// Renderer parameter types

import type { CellValue, RowId, SortDirection } from "./basic";
import type { ColumnDefinition } from "./columns";
import type { ColumnGroupDefinition } from "./column-groups";
import type { ColumnFilterModel } from "./filters";
import type { GridLabels } from "../i18n";
import type { ColumnPin, ColumnRegion } from "./geometry";
import type { HierarchyGroupRow, HierarchyRowKind, HierarchyTotalRow } from "./row-groups";

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
  /** Kind of the row under a hierarchy; absent while flat. */
  rowKind?: HierarchyRowKind;
}

/** Group label renderer params: the label cell of a group or total row. */
export interface GroupLabelRendererParams {
  row: HierarchyGroupRow | HierarchyTotalRow;
  viewIndex: number;
  /** The formatted label from `labels.rowGroups`. */
  label: string;
  /** Flip the group as a gesture; a no-op on the total row. */
  toggle: () => void;
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

/** Filter renderer params: the content of a column's filter popup. */
export interface FilterRendererParams {
  column: ColumnDefinition;
  /** Normalized column identity: `colId ?? field`. */
  columnId: string;
  currentFilter?: ColumnFilterModel;
  /** Populated for text, boolean and object columns; empty otherwise. */
  distinctValues: CellValue[];
  labels: GridLabels;
  /** Set the column's filter (`null` clears it) and close the popup. */
  apply: (filter: ColumnFilterModel | null) => void;
  close: () => void;
}

/** Params of a custom filter popup's clear control. */
export interface FilterClearParams {
  /** Clear the column's filter and close the popup. */
  clear: () => void;
  hasFilter: boolean;
  labels: GridLabels;
}

/** Custom filter popup. `clear` is required: `"default"` keeps the grid's Clear button, `null` drops it on purpose. */
export interface FilterRendererDefinition<TContent, TClear> {
  content: TContent;
  clear: "default" | TClear | null;
}

/** Group header renderer params: one fragment of a column group (PRD 007 D9). */
export interface ColumnGroupHeaderParams {
  /** The group's definition, as the caller passed it. */
  group: ColumnGroupDefinition;
  groupId: string;
  /** Header band the fragment fills. */
  band: number;
  region: ColumnRegion;
  /** Displayed leaves the fragment spans. */
  leafCount: number;
  /** Ids of the spanned leaves, in display order. */
  columnIds: readonly string[];
}
