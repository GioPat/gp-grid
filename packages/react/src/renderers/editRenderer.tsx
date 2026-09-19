// packages/react/src/renderers/editRenderer.tsx

import React from "react";
import type {
  GridCore,
  ColumnDefinition,
  CellValue,
  RowId,
  EditRendererParams,
} from "@gp-grid/core";
import type { ReactEditRenderer } from "../types";
import { getCellValue } from "./cellRenderer";

export interface RenderEditCellOptions<TData> {
  column: ColumnDefinition;
  rowData: unknown;
  rowIndex: number;
  colIndex: number;
  initialValue: CellValue;
  /** Session token of the open edit; tags every editor callback. */
  editId: number;
  coreRef: React.RefObject<GridCore<TData> | null>;
  editRenderers: Record<string, ReactEditRenderer>;
  globalEditRenderer?: ReactEditRenderer;
  /** Pre-resolved raw value read through the core (record-less rows). */
  rawValue?: CellValue;
  /** Stable identity for the row, when the source exposes one. */
  rowId?: RowId;
  /** Read another field's raw value at this row without a record. */
  getValue?: (field: string) => CellValue;
}

/**
 * Render edit cell content based on column configuration and renderer registries
 */
export function renderEditCell<TData>(
  options: RenderEditCellOptions<TData>,
): React.ReactNode {
  const {
    column,
    rowData,
    rowIndex,
    colIndex,
    initialValue,
    editId,
    coreRef,
    editRenderers,
    globalEditRenderer,
    rawValue: providedRawValue,
    rowId,
    getValue,
  } = options;

  const core = coreRef.current;
  if (!core) return null;

  const rawValue = providedRawValue ?? getCellValue(rowData, column.field);
  const displayValue = column.valueFormatter
    ? column.valueFormatter(rawValue)
    : rawValue;
  const params: EditRendererParams = {
    value: displayValue,
    rowData,
    rowId,
    columnId: column.colId ?? column.field,
    getValue,
    column,
    rowIndex,
    colIndex,
    isActive: true,
    isSelected: true,
    isEditing: true,
    initialValue,
    onValueChange: (newValue) => core.updateEditValue(newValue, editId),
    onCommit: () => core.commitEdit(editId),
    onCancel: () => core.cancelEdit(editId),
  };

  // Check for column-specific renderer
  if (column.editRenderer) {
    if (typeof column.editRenderer === "function") {
      return column.editRenderer(params) as React.ReactNode;
    }
    const renderer = editRenderers[column.editRenderer];
    if (renderer) {
      return renderer(params);
    }
  }

  // Fall back to global renderer
  if (globalEditRenderer) {
    return globalEditRenderer(params);
  }

  // Default input
  return (
    <input
      className="gp-grid-edit-input"
      type="text"
      defaultValue={initialValue == null ? "" : String(initialValue)}
      autoFocus
      onFocus={(e) => e.target.select()}
      onChange={(e) => core.updateEditValue(e.target.value, editId)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          core.commitEdit(editId);
        } else if (e.key === "Escape") {
          core.cancelEdit(editId);
        } else if (e.key === "Tab") {
          e.preventDefault();
          core.commitEdit(editId);
          core.selection.moveFocus(e.shiftKey ? "left" : "right", false);
        }
      }}
      onBlur={() => core.commitEdit(editId)}
    />
  );
}
