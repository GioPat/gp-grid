// packages/vue/src/components/cell-props.ts
// Shared shape of one body cell: `GridBody` builds the position-independent
// part once and `GridRow` spreads it onto every cell it mounts.

import type {
  CellPosition,
  CellRange,
  CellValue,
  DragState,
  GridCore,
  ResolvedColumn,
} from "@gp-grid/core";
import type { Row, VueCellRenderer, VueEditRenderer } from "../types";

export interface GridCellProps {
  rowIndex: number;
  rowData: Row | undefined;
  /** Region-local geometry: `regionOffset` is the inset inside its region. */
  column: ResolvedColumn;
  /** 0-based index in the displayed columns, for `aria-colindex`. */
  displayedIndex: number;
  rowHeight: number;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  /** Read (not used) so a hover change re-renders the cell for highlight classes. */
  hoverPosition: CellPosition | null;
  /**
   * Read (not used) so a batch re-renders every cell: raw values come from the
   * core, which is not reactive, and a columnar row's props never change.
   */
  renderToken: number;
  editingCell: { row: number; col: number; initialValue: CellValue; editId: number } | null;
  dragState: DragState;
  coreRef: GridCore<Row> | null;
  cellRenderers: Record<string, VueCellRenderer>;
  editRenderers: Record<string, VueEditRenderer>;
  globalCellRenderer?: VueCellRenderer;
  globalEditRenderer?: VueEditRenderer;
  onCellMouseDown: (rowIndex: number, colIndex: number, e: PointerEvent) => void;
  onCellDoubleClick: (rowIndex: number, colIndex: number) => void;
  onCellMouseEnter: (rowIndex: number, colIndex: number) => void;
  onCellMouseLeave: () => void;
}

/** Everything a cell needs except the position it renders at. */
export type GridRowCellContext = Omit<
  GridCellProps,
  "rowIndex" | "rowData" | "column" | "displayedIndex"
>;
