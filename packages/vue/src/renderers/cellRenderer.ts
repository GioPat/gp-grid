// packages/vue/src/renderers/cellRenderer.ts

import { h, createTextVNode, type VNode } from "vue";
import type { ColumnDefinition, Row, CellValue, CellRendererParams } from "@gp-grid/core";
import type { VueCellRenderer } from "../types";

/**
 * Ensure we always return a VNode, never a plain string
 */
function toVNode(value: VNode | string | null | undefined): VNode {
  if (value == null || value === "") {
    return createTextVNode("");
  }
  if (typeof value === "string") {
    return createTextVNode(value);
  }
  return value;
}

/**
 * Get cell value from row data, supporting dot-notation for nested fields
 */
export function getCellValue(rowData: Row, field: string): CellValue {
  const parts = field.split(".");
  let value: unknown = rowData;

  for (const part of parts) {
    if (value == null || typeof value !== "object") {
      return null;
    }
    value = (value as Record<string, unknown>)[part];
  }

  return (value ?? null) as CellValue;
}

export interface RenderCellOptions {
  column: ColumnDefinition;
  rowData: Row;
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

  const value = getCellValue(rowData, column.field);
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
      return toVNode(renderer(params));
    }
  }

  // Fall back to global renderer
  if (globalCellRenderer) {
    return toVNode(globalCellRenderer(params));
  }

  // Default text rendering
  return createTextVNode(value == null ? "" : String(value));
}
