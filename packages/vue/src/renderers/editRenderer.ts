// packages/vue/src/renderers/editRenderer.ts

import { h, type VNode } from "vue";
import type { GridCore, ColumnDefinition, Row, CellValue, EditRendererParams } from "gp-grid-core";
import type { VueEditRenderer } from "../types";
import { getCellValue } from "./cellRenderer";

export interface RenderEditCellOptions {
  column: ColumnDefinition;
  rowData: Row;
  rowIndex: number;
  colIndex: number;
  initialValue: CellValue;
  core: GridCore | null;
  editRenderers: Record<string, VueEditRenderer>;
  globalEditRenderer?: VueEditRenderer;
}

/**
 * Render edit cell content based on column configuration and renderer registries
 */
export function renderEditCell(
  options: RenderEditCellOptions,
): VNode | null {
  const {
    column,
    rowData,
    rowIndex,
    colIndex,
    initialValue,
    core,
    editRenderers,
    globalEditRenderer,
  } = options;

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
  return h("input", {
    class: "gp-grid-edit-input",
    type: "text",
    value: initialValue == null ? "" : String(initialValue),
    autofocus: true,
    onFocus: (e: FocusEvent) => (e.target as HTMLInputElement).select(),
    onInput: (e: Event) => core.updateEditValue((e.target as HTMLInputElement).value),
    onKeydown: (e: KeyboardEvent) => {
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
    },
    onBlur: () => core.commitEdit(),
  });
}
