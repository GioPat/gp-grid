// packages/core/src/types/ui-state.ts

import type {
  ColumnDefinition,
  CellPosition,
  CellRange,
  CellValue,
  SortDirection,
  ColumnFilterModel,
} from "./index";
import { createSeedColumnLayout } from "../geometry/column-layout";
import type { ColumnLayoutMode, ColumnLayoutSnapshot } from "./geometry";

// =============================================================================
// Slot & Header Data Types
// =============================================================================

export interface SlotData<TData = unknown> {
  slotId: string;
  rowIndex: number;
  /**
   * Source record for object sources; `undefined` for a columnar row, which
   * renders without materializing a record. Read cell values through the core
   * read path (`GridCore.getCellValue`), not from this field.
   */
  rowData: TData | undefined;
  /**
   * Assignment generation for this slot. A callback that captured an older
   * generation belongs to a superseded assignment and must be ignored.
   */
  generation: number;
  translateY: number;
}

export interface HeaderData {
  column: ColumnDefinition;
  sortDirection?: SortDirection;
  sortIndex?: number;
  hasFilter: boolean;
}

export interface FilterPopupState {
  isOpen: boolean;
  colIndex: number;
  column: ColumnDefinition | null;
  anchorRect: { top: number; left: number; width: number; height: number } | null;
  distinctValues: CellValue[];
  currentFilter?: ColumnFilterModel;
}

// =============================================================================
// Initial State
// =============================================================================

export interface InitialStateArgs {
  initialWidth?: number;
  initialHeight?: number;
  /** Resolved layout the wrapper renders until the core emits `COLUMNS_CHANGED`. */
  initialColumns?: ColumnDefinition[];
  /** Displayed-column layout seeded for the deterministic first render. */
  initialLayout?: ColumnLayoutSnapshot;
  /** Layout mode seeded alongside `initialLayout`. Default: "fit". */
  initialColumnLayout?: ColumnLayoutMode;
}

/**
 * The deterministic first render (SSR or the frame before the core mounts)
 * resolves the displayed layout against `initialWidth`; a real measurement
 * replaces it on the first `SET_CONTENT_SIZE`. Adapters that already hold a
 * core-resolved snapshot pass `initialLayout` instead.
 */
const seedLayout = (
  args: InitialStateArgs | undefined,
): ColumnLayoutSnapshot | null => {
  if (args?.initialLayout !== undefined) return args.initialLayout;
  const columns = args?.initialColumns ?? [];
  if (columns.length === 0) return null;
  return createSeedColumnLayout(
    columns,
    args?.initialColumnLayout ?? "fit",
    args?.initialWidth ?? 0,
  );
};

export const createInitialState = <TData = unknown>(args?: InitialStateArgs): GridState<TData> => {
  const layout = seedLayout(args);
  return {
    slots: new Map(),
    activeCell: null,
    selectionRange: null,
    editingCell: null,
    peekCell: null,
    contentWidth: layout?.totalWidth ?? 0,
    contentHeight: args?.initialHeight ?? 0,
    viewportWidth: args?.initialWidth ?? 0,
    viewportHeight: args?.initialHeight ?? 0,
    rowsWrapperOffset: 0,
    headers: new Map(),
    filterPopup: null,
    isLoading: false,
    error: null,
    totalRows: 0,
    visibleRowRange: null,
    hoverPosition: null,
    columns: args?.initialColumns ?? [],
    layout,
    columnLayout: args?.initialColumnLayout ?? "fit",
    geometryRevision: 0,
    pendingScrollTop: null,
    pendingScrollLeft: null,
  };
};

// =============================================================================
// Grid State
// =============================================================================

export interface GridState<TData = unknown> {
  slots: Map<string, SlotData<TData>>;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  editingCell: { row: number; col: number; initialValue: CellValue; editId: number } | null;
  /** Cell currently shown in a read-only peek overlay (multi-line expand on double-click) */
  peekCell: CellPosition | null;
  contentWidth: number;
  contentHeight: number;
  /** Viewport width (container's visible width) for column scaling */
  viewportWidth: number;
  /** Viewport height (container's visible height) for loader positioning */
  viewportHeight: number;
  /** Y offset for rows wrapper when virtualization is active (keeps row translateY values small) */
  rowsWrapperOffset: number;
  /** Header state keyed by `ColumnId`. */
  headers: Map<string, HeaderData>;
  filterPopup: FilterPopupState | null;
  isLoading: boolean;
  error: string | null;
  totalRows: number;
  /** Visible row range (start inclusive, end inclusive). Used to prevent selection showing in overscan. */
  visibleRowRange: { start: number; end: number } | null;
  /** Currently hovered cell position (for highlighting) */
  hoverPosition: CellPosition | null;
  /** Core-owned resolved layout (ordered columns with effective widths/visibility). */
  columns: ColumnDefinition[];
  /**
   * Core-resolved displayed-column layout. `null` until the core publishes
   * its first snapshot; wrappers that render before mount seed it.
   */
  layout: ColumnLayoutSnapshot | null;
  /** Selected column layout mode, mirrored from the core. */
  columnLayout: ColumnLayoutMode;
  /** Last committed geometry revision, for change detection. */
  geometryRevision: number;
  /** Pending programmatic vertical scroll — framework applies it and clears it */
  pendingScrollTop: number | null;
  /** Pending programmatic horizontal scroll — framework applies it and clears it */
  pendingScrollLeft: number | null;
}
