// packages/vue/src/types.ts

import type { VNode, Component } from "vue";
import type {
  AutoFitOptions,
  RowId,
  ColumnDefinition as CoreColumnDefinition,
  ColumnGroupChild,
  ColumnGroupHeaderParams,
  ColumnGroupLimits,
  ColumnSchemaError,
  CellRendererParams,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  ColumnResizedEvent,
  ColumnStateUpdate,
  ColumnLayoutMode,
  EditRendererParams,
  FreezeRowsOptions,
  FrozenRowsState,
  GridLabelOverrides,
  GridIcon,
  HeaderRendererParams,
  HighlightingOptions,
  DataSource,
  RowDragEndEvent,
  RowLoadingOptions,
  RowResizedEvent,
} from "@gp-grid/core";

// =============================================================================
// Row alias
// =============================================================================

/** Row data alias — core's generic defaults to `unknown`, this preserves the name. */
export type Row = unknown;

// =============================================================================
// Vue Renderer Types
// =============================================================================

/**
 * Vue cell renderer - either a render function returning a VNode/string,
 * or a Vue component (e.g. an imported SFC) that accepts CellRendererParams as props.
 */
export type VueCellRenderer<TData = unknown> =
  | ((params: CellRendererParams<TData>) => VNode | string | null)
  | Component;

/**
 * Vue edit renderer - either a render function returning a VNode,
 * or a Vue component that accepts EditRendererParams as props.
 */
export type VueEditRenderer<TData = unknown> =
  | ((params: EditRendererParams<TData>) => VNode | null)
  | Component;

/**
 * Vue header renderer - either a render function returning a VNode/string,
 * or a Vue component that accepts HeaderRendererParams as props.
 */
export type VueHeaderRenderer =
  | ((params: HeaderRendererParams) => VNode | string | null)
  | Component;

/**
 * Vue group header renderer: renders one fragment of a column group, as a
 * render function or a component taking ColumnGroupHeaderParams as props.
 */
export type VueGroupHeaderRenderer =
  | ((params: ColumnGroupHeaderParams) => VNode | string | null)
  | Component;

/**
 * Header renderer registry, shared by columns and groups: a key receives the
 * params of whichever definition names it.
 */
export type VueHeaderRendererRegistry = Record<
  string,
  VueHeaderRenderer | VueGroupHeaderRenderer
>;

// =============================================================================
// Column Definition
// =============================================================================

/**
 * Vue-specific column definition. Extends the framework-agnostic core definition
 * by allowing the per-column renderers to also be Vue Components (e.g. imported SFCs)
 * in addition to render functions and registry-key strings.
 */
export interface ColumnDefinition<TData = unknown>
  extends Omit<CoreColumnDefinition, "cellRenderer" | "editRenderer" | "headerRenderer"> {
  cellRenderer?: string | VueCellRenderer<TData>;
  editRenderer?: string | VueEditRenderer<TData>;
  headerRenderer?: string | VueHeaderRenderer;
}

// =============================================================================
// Component Props Types
// =============================================================================

export interface GpGridProps<TData = unknown> {
  columns: ColumnDefinition<TData>[];
  /** Controlled per-column state; applied through the core whenever it changes. */
  columnState?: ColumnStateUpdate[];
  dataSource?: DataSource<TData>;
  rowData?: TData[];
  rowHeight: number;
  /** Header height in pixels, the default height of every band. Default: rowHeight */
  headerHeight?: number;
  /** Height of each header band, indexed by band; a band without one is `headerHeight`. Changeable at runtime. */
  headerBandHeights?: readonly number[];
  /**
   * Nested header groups over the column ids; every column is referenced
   * once, ungrouped ones at the root. Applied together with `columns`.
   */
  columnGroups?: readonly ColumnGroupChild[];
  /** Budgets of `columnGroups`. Read at creation. */
  columnGroupLimits?: ColumnGroupLimits;
  /** Called when a column change is rejected; the previous schema stays. */
  onColumnSchemaRejected?: (error: ColumnSchemaError) => void;
  overscan?: number;
  /** Column overscan in CSS px per side for the mounted center window. */
  columnOverscan?: number;
  /** Displayed-width policy: "fit" (default) expands columns to the viewport. */
  columnLayout?: ColumnLayoutMode;
  rowLoading?: RowLoadingOptions;
  /**
   * Number of leading displayed rows kept visible below the header. Applied
   * at runtime; a new identity never rebuilds the core.
   */
  freezeRows?: FreezeRowsOptions;
  /** Called when the effective frozen count or its limiting reason changes. */
  onFrozenRowsChanged?: (state: FrozenRowsState) => void;
  sortingEnabled?: boolean;
  darkMode?: boolean;
  wheelDampening?: number;
  /** Max accumulated touch-fling velocity (logical px/ms) when scroll virtualization is active. Pair higher values with overscan 10-12. Default: 20 × rowHeight (~20,000 rows/s) */
  maxFlingVelocity?: number;
  cellRenderers?: Record<string, VueCellRenderer<TData>>;
  editRenderers?: Record<string, VueEditRenderer<TData>>;
  /** Header renderer registry, keyed by a column's or a group's `headerRenderer`. */
  headerRenderers?: VueHeaderRendererRegistry;
  cellRenderer?: VueCellRenderer<TData>;
  editRenderer?: VueEditRenderer<TData>;
  headerRenderer?: VueHeaderRenderer;
  /** SVG used by the default header's pin toggle. */
  pinIcon?: GridIcon;
  /** Initial viewport width for SSR (pixels). ResizeObserver takes over on client. */
  initialWidth?: number;
  /** Initial viewport height for SSR (pixels). ResizeObserver takes over on client. */
  initialHeight?: number;
  /** Row/column/cell highlighting configuration. */
  highlighting?: HighlightingOptions<TData>;
  /** Function to extract unique ID from row. Required when onCellValueChanged is provided. */
  getRowId?: (row: TData) => RowId;
  /** Called when a cell value is changed via editing, fill drag, or paste. Requires getRowId. */
  onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
  /** Called when a write is refused because the bound source is read-only. */
  onWriteRejected?: (event: CellWriteRejectedEvent) => void;
  /** Custom loading component to render instead of default spinner */
  loadingComponent?: Component<{ isLoading: boolean }>;
  /** Whether clicking and dragging any cell in a row drags the entire row. Default: false */
  rowDragEntireRow?: boolean;
  /** Called when a row is dropped after dragging. Consumer handles data reordering. */
  onRowDragEnd?: (event: RowDragEndEvent) => void;
  /** Called when a column is resized. */
  onColumnResized?: (event: ColumnResizedEvent) => void;
  /**
   * Whether the user can resize rows: every cell renders the row edge handle,
   * and Alt+ArrowUp/Down and Alt+Shift+Enter act. Changeable at runtime.
   * Default: false
   */
  rowResize?: boolean;
  /** Called per row resized by a drag, a key or a fit. */
  onRowResized?: (event: RowResizedEvent) => void;
  /** Clamps for the fit commands and the row resize gesture. Read at creation. */
  autoFit?: AutoFitOptions;
  /** Called when a column is moved/reordered. */
  onColumnMoved?: (event: ColumnMovedEvent) => void;
  /** Called when a column is pinned or unpinned. */
  onColumnPinned?: (event: ColumnPinnedEvent) => void;
  /** Override any user-visible grid label. Unspecified labels fall back to English defaults. */
  labels?: GridLabelOverrides;
}
