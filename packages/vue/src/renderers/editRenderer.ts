// packages/vue/src/renderers/editRenderer.ts

import { h, createTextVNode, type VNode } from "vue";
import type {
  GridCore,
  ColumnDefinition,
  CellValue,
  RowId,
  EditRendererParams,
} from "@gp-grid/core";
import type { VueEditRenderer } from "../types";
import { getCellValue } from "./cellRenderer";
import { invokeRenderer } from "./utils";

export interface RenderEditCellOptions {
  column: ColumnDefinition;
  rowData: unknown;
  rowIndex: number;
  colIndex: number;
  initialValue: CellValue;
  /** Session token of the open edit; tags every editor callback. */
  editId: number;
  core: GridCore | null;
  editRenderers: Record<string, VueEditRenderer>;
  globalEditRenderer?: VueEditRenderer;
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
export function renderEditCell(
  options: RenderEditCellOptions,
): VNode {
  const {
    column,
    rowData,
    rowIndex,
    colIndex,
    initialValue,
    editId,
    core,
    editRenderers,
    globalEditRenderer,
    rawValue: providedRawValue,
    rowId,
    getValue,
  } = options;

  if (!core) return createTextVNode("");

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
  if (column.editRenderer != null) {
    if (typeof column.editRenderer === "string") {
      const renderer = editRenderers[column.editRenderer];
      if (renderer) {
        return invokeRenderer(renderer, params);
      }
    } else {
      return invokeRenderer(column.editRenderer as VueEditRenderer, params);
    }
  }

  // Fall back to global renderer
  if (globalEditRenderer) {
    return invokeRenderer(globalEditRenderer, params);
  }

  // Default input
  return h("input", {
    class: "gp-grid-edit-input",
    "data-edit-id": editId,
    type: "text",
    value: initialValue == null ? "" : String(initialValue),
    autofocus: true,
    onFocus: (e: FocusEvent) => (e.target as HTMLInputElement).select(),
    onInput: (e: Event) => core.updateEditValue((e.target as HTMLInputElement).value, editId),
    onKeydown: (e: KeyboardEvent) => {
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
    },
    onBlur: (event: FocusEvent) => {
      const blurred = event.currentTarget as HTMLInputElement;
      const grid = blurred.closest(".gp-grid-container");
      requestAnimationFrame(() => {
        const replacement = grid?.querySelector<HTMLInputElement>(
          `.gp-grid-edit-input[data-edit-id="${editId}"]`,
        );
        if (replacement && replacement !== blurred) {
          replacement.focus();
          return;
        }
        core.commitEdit(editId);
      });
    },
  });
}
