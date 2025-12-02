// packages/react/src/SlotRow.tsx

import React, { memo, useCallback } from "react";
import type {
  ColumnDefinition,
  Row,
  CellValue,
  CellRendererParams,
  EditRendererParams,
} from "gp-grid-core";

// =============================================================================
// Types
// =============================================================================

export type ReactCellRenderer = (params: CellRendererParams) => React.ReactNode;
export type ReactEditRenderer = (params: EditRendererParams) => React.ReactNode;

export interface SlotRowProps {
  slotId: string;
  rowIndex: number;
  rowData: Row;
  translateY: number;
  columns: ColumnDefinition[];
  columnPositions: number[];
  rowHeight: number;
  contentWidth: number;
  
  // Selection state
  activeCell: { row: number; col: number } | null;
  selectionRange: { startRow: number; startCol: number; endRow: number; endCol: number } | null;
  editingCell: { row: number; col: number; initialValue: CellValue } | null;
  
  // Renderers
  cellRenderers: Record<string, ReactCellRenderer>;
  editRenderers: Record<string, ReactEditRenderer>;
  cellRenderer?: ReactCellRenderer;
  editRenderer?: ReactEditRenderer;
  
  // Callbacks
  onCellClick: (rowIndex: number, colIndex: number, e: React.MouseEvent) => void;
  onCellDoubleClick: (rowIndex: number, colIndex: number) => void;
  onEditValueChange: (value: CellValue) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getCellValue(rowData: Row, field: string): CellValue {
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

function isInRange(
  row: number,
  col: number,
  range: { startRow: number; startCol: number; endRow: number; endCol: number } | null
): boolean {
  if (!range) return false;

  const minRow = Math.min(range.startRow, range.endRow);
  const maxRow = Math.max(range.startRow, range.endRow);
  const minCol = Math.min(range.startCol, range.endCol);
  const maxCol = Math.max(range.startCol, range.endCol);

  return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
}

// =============================================================================
// SlotRow Component
// =============================================================================

export const SlotRow = memo(function SlotRow(props: SlotRowProps) {
  const {
    slotId,
    rowIndex,
    rowData,
    translateY,
    columns,
    columnPositions,
    rowHeight,
    contentWidth,
    activeCell,
    selectionRange,
    editingCell,
    cellRenderers,
    editRenderers,
    cellRenderer,
    editRenderer,
    onCellClick,
    onCellDoubleClick,
    onEditValueChange,
    onEditCommit,
    onEditCancel,
  } = props;

  const renderCellContent = useCallback(
    (column: ColumnDefinition, colIndex: number): React.ReactNode => {
      const value = getCellValue(rowData, column.field);
      const isActive = activeCell?.row === rowIndex && activeCell?.col === colIndex;
      const isSelected = isInRange(rowIndex, colIndex, selectionRange);
      const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;

      // Editing mode
      if (isEditing && editingCell) {
        const params: EditRendererParams = {
          value,
          rowData,
          column,
          rowIndex,
          colIndex,
          isActive: true,
          isSelected: true,
          isEditing: true,
          initialValue: editingCell.initialValue,
          onValueChange: onEditValueChange,
          onCommit: onEditCommit,
          onCancel: onEditCancel,
        };

        // Check for column-specific edit renderer
        if (column.editRenderer && typeof column.editRenderer === "string") {
          const renderer = editRenderers[column.editRenderer];
          if (renderer) {
            return renderer(params);
          }
        }

        // Fall back to global edit renderer
        if (editRenderer) {
          return editRenderer(params);
        }

        // Default input
        return (
          <input
            className="gp-grid-edit-input"
            type="text"
            defaultValue={editingCell.initialValue == null ? "" : String(editingCell.initialValue)}
            autoFocus
            style={{ width: "100%", height: "100%", border: "none", outline: "none" }}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onEditCommit();
              } else if (e.key === "Escape") {
                onEditCancel();
              }
            }}
            onBlur={onEditCommit}
          />
        );
      }

      // Normal display mode
      const params: CellRendererParams = {
        value,
        rowData,
        column,
        rowIndex,
        colIndex,
        isActive,
        isSelected,
        isEditing: false,
      };

      // Check for column-specific renderer
      if (column.cellRenderer && typeof column.cellRenderer === "string") {
        const renderer = cellRenderers[column.cellRenderer];
        if (renderer) {
          return renderer(params);
        }
      }

      // Fall back to global renderer
      if (cellRenderer) {
        return cellRenderer(params);
      }

      // Default text rendering
      return value == null ? "" : String(value);
    },
    [
      rowData,
      rowIndex,
      activeCell,
      selectionRange,
      editingCell,
      cellRenderers,
      editRenderers,
      cellRenderer,
      editRenderer,
      onEditValueChange,
      onEditCommit,
      onEditCancel,
    ]
  );

  return (
    <div
      data-slot-id={slotId}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        transform: `translateY(${translateY}px)`,
        width: contentWidth,
        height: rowHeight,
        display: "flex",
      }}
    >
      {columns.map((column, colIndex) => {
        const isActive = activeCell?.row === rowIndex && activeCell?.col === colIndex;
        const isSelected = isInRange(rowIndex, colIndex, selectionRange);
        const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;

        const cellClasses = [
          "gp-grid-cell",
          isActive && "gp-grid-cell--active",
          isSelected && "gp-grid-cell--selected",
          isEditing && "gp-grid-cell--editing",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={`${slotId}-${colIndex}`}
            className={cellClasses}
            style={{
              position: "absolute",
              left: columnPositions[colIndex],
              width: column.width,
              height: rowHeight,
            }}
            onClick={(e) => onCellClick(rowIndex, colIndex, e)}
            onDoubleClick={() => onCellDoubleClick(rowIndex, colIndex)}
          >
            {renderCellContent(column, colIndex)}
          </div>
        );
      })}
    </div>
  );
});

