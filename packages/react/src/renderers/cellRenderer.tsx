// packages/react/src/renderers/cellRenderer.tsx

import React from "react";
import { getFieldValue } from "@gp-grid/core";
import type { ColumnDefinition, Row, CellRendererParams } from "@gp-grid/core";
import type { ReactCellRenderer } from "../types";

export { getFieldValue as getCellValue } from "@gp-grid/core";

export interface RenderCellOptions {
  column: ColumnDefinition;
  rowData: Row;
  rowIndex: number;
  colIndex: number;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  cellRenderers: Record<string, ReactCellRenderer>;
  globalCellRenderer?: ReactCellRenderer;
}

/**
 * Render cell content based on column configuration and renderer registries
 */
export function renderCell(options: RenderCellOptions): React.ReactNode {
  const {
    column,
    rowData,
    rowIndex,
    colIndex,
    isActive,
    isSelected,
    isEditing,
    cellRenderers,
    globalCellRenderer,
  } = options;

  const value = getFieldValue(rowData, column.field);
  const params: CellRendererParams = {
    value,
    rowData,
    column,
    rowIndex,
    colIndex,
    isActive,
    isSelected,
    isEditing,
  };

  // Check for column-specific renderer
  if (column.cellRenderer && typeof column.cellRenderer === "string") {
    const renderer = cellRenderers[column.cellRenderer];
    if (renderer) {
      return renderer(params);
    }
  }

  // Fall back to global renderer
  if (globalCellRenderer) {
    return globalCellRenderer(params);
  }

  // Default text rendering
  return value == null ? "" : String(value);
}
