// packages/vue/src/components/cell-props.ts
// Shared shape of one body cell: `GridBody` builds the position-independent
// part once and `GridRow` spreads it onto every cell it mounts.

import type {
  CellPosition,
  CellRange,
  CellValue,
  DragState,
  GridCore,
  ResizeTarget,
  ResolvedColumn,
} from "@gp-grid/core";
import type { InjectionKey, Ref } from "vue";
import type { Row, VueCellRenderer, VueEditRenderer } from "../types";

/**
 * Hover position for the highlight classes. Injected rather than passed as a
 * prop: a prop would re-render every cell on each hover change, and the pointer
 * crosses rows continuously while a wheel scrolls under it.
 */
export const HOVER_POSITION: InjectionKey<Readonly<Ref<CellPosition | null>>> =
  Symbol("gp-grid-hover-position");

export interface GridCellProps {
  rowIndex: number;
  rowData: Row | undefined;
  /** The row's height, where a row handle drag starts. */
  rowHeight: number;
  /** Region-local geometry: `regionOffset` is the inset inside its region. */
  column: ResolvedColumn;
  /** 0-based index in the displayed columns, for `aria-colindex`. */
  displayedIndex: number;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  /**
   * Read (not used) so a content batch re-renders every cell: raw values come
   * from the core, which is not reactive, and a columnar row's props never change.
   */
  renderToken: number;
  /** The slot's assignment generation, read so a re-assigned row re-renders alone. */
  generation: number;
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
  onRowResizePointerDown: (rowIndex: number, rowHeight: number, e: PointerEvent) => void;
  onResizeDoubleClick: (target: ResizeTarget) => void;
  /** Render the row edge handle while not editing. */
  rowResize: boolean;
}

/** Everything a cell needs except the position it renders at. */
export type GridRowCellContext = Omit<
  GridCellProps,
  "rowIndex" | "rowData" | "rowHeight" | "column" | "displayedIndex" | "generation"
>;
