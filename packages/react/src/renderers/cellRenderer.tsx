// packages/react/src/renderers/cellRenderer.tsx

import React from "react";
import { getFieldValue, formatCellValue } from "@gp-grid/core";
import type { ColumnDefinition, CellRendererParams } from "@gp-grid/core";
import type { ReactCellRenderer } from "../types";

export { getFieldValue as getCellValue } from "@gp-grid/core";

export interface RenderCellOptions {
  column: ColumnDefinition;
  rowData: unknown;
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

  const rawValue = getFieldValue(rowData, column.field);
  const displayValue = column.valueFormatter
    ? column.valueFormatter(rawValue)
    : rawValue;
  const params: CellRendererParams = {
    value: displayValue,
    rowData,
    column,
    rowIndex,
    colIndex,
    isActive,
    isSelected,
    isEditing,
  };

  // Check for column-specific renderer
  if (column.cellRenderer) {
    if (typeof column.cellRenderer === "function") {
      return column.cellRenderer(params) as React.ReactNode;
    }
    const renderer = cellRenderers[column.cellRenderer];
    if (renderer) {
      return renderer(params);
    }
  }

  // Fall back to global renderer
  if (globalCellRenderer) {
    return globalCellRenderer(params);
  }

  // Default text rendering — re-format to string in case rawValue has no formatter
  return formatCellValue(rawValue, column.valueFormatter);
}
