// packages/react/src/renderers/editRenderer.tsx

import React from "react";
import type { GridCore, ColumnDefinition, Row, CellValue, EditRendererParams } from "@gp-grid/core";
import type { ReactEditRenderer } from "../types";
import { getCellValue } from "./cellRenderer";

export interface RenderEditCellOptions<TData extends Row> {
  column: ColumnDefinition;
  rowData: Row;
  rowIndex: number;
  colIndex: number;
  initialValue: CellValue;
  coreRef: React.RefObject<GridCore<TData> | null>;
  editRenderers: Record<string, ReactEditRenderer>;
  globalEditRenderer?: ReactEditRenderer;
}

/**
 * Render edit cell content based on column configuration and renderer registries
 */
export function renderEditCell<TData extends Row>(
  options: RenderEditCellOptions<TData>,
): React.ReactNode {
  const {
    column,
    rowData,
    rowIndex,
    colIndex,
    initialValue,
    coreRef,
    editRenderers,
    globalEditRenderer,
  } = options;

  const core = coreRef.current;
  if (!core) return null;

  const value = getCellValue(rowData, column.field);
  const params: EditRendererParams = {
    value,
    rowData,
    column,
    rowIndex,
    colIndex,
    isActive: true,
    isSelected: true,
    isEditing: true,
    initialValue,
    onValueChange: (newValue) => core.updateEditValue(newValue),
    onCommit: () => core.commitEdit(),
    onCancel: () => core.cancelEdit(),
  };

  // Check for column-specific renderer
  if (column.editRenderer && typeof column.editRenderer === "string") {
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
      onChange={(e) => core.updateEditValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          core.commitEdit();
        } else if (e.key === "Escape") {
          core.cancelEdit();
        } else if (e.key === "Tab") {
          e.preventDefault();
          core.commitEdit();
          core.selection.moveFocus(e.shiftKey ? "left" : "right", false);
        }
      }}
      onBlur={() => core.commitEdit()}
    />
  );
}
