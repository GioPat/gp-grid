// packages/vue/src/renderers/cellRenderer.ts

import { createTextVNode, type VNode } from "vue";
import { getFieldValue, formatCellValue } from "@gp-grid/core";
import type { ColumnDefinition, CellRendererParams } from "@gp-grid/core";
import type { VueCellRenderer } from "../types";
import { invokeRenderer } from "./utils";

export { getFieldValue as getCellValue } from "@gp-grid/core";

export interface RenderCellOptions {
  column: ColumnDefinition;
  rowData: unknown;
  rowIndex: number;
  colIndex: number;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  cellRenderers: Record<string, VueCellRenderer>;
  globalCellRenderer?: VueCellRenderer;
}

/**
 * Render cell content based on column configuration and renderer registries
 */
export function renderCell(options: RenderCellOptions): VNode {
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
  if (column.cellRenderer != null) {
    if (typeof column.cellRenderer === "string") {
      const renderer = cellRenderers[column.cellRenderer];
      if (renderer) {
        return invokeRenderer(renderer, params);
      }
    } else {
      return invokeRenderer(column.cellRenderer as VueCellRenderer, params);
    }
  }

  // Fall back to global renderer
  if (globalCellRenderer) {
    return invokeRenderer(globalCellRenderer, params);
  }

  // Default text rendering — re-format to string in case rawValue has no formatter
  return createTextVNode(formatCellValue(rawValue, column.valueFormatter));
}
