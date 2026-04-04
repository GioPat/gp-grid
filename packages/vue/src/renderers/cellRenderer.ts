// packages/vue/src/renderers/cellRenderer.ts

import { createTextVNode, type VNode } from "vue";
import { getFieldValue, formatCellValue } from "@gp-grid/core";
import type { ColumnDefinition, CellRendererParams } from "@gp-grid/core";
import type { VueCellRenderer } from "../types";
import { toVNode } from "./utils";

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
  if (column.cellRenderer) {
    if (typeof column.cellRenderer === "function") {
      return toVNode(column.cellRenderer(params) as VNode | string | null);
    }
    const renderer = cellRenderers[column.cellRenderer];
    if (renderer) {
      return toVNode(renderer(params));
    }
  }

  // Fall back to global renderer
  if (globalCellRenderer) {
    return toVNode(globalCellRenderer(params));
  }

  // Default text rendering
  return createTextVNode(formatCellValue(value, column.valueFormatter));
}
