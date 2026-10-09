// packages/react/src/types.ts

import type {
  RowId,
  AutoFitOptions,
  ColumnDefinition,
  ColumnGroupChild,
  ColumnGroupHeaderParams,
  ColumnGroupLimits,
  ColumnLayoutMode,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  ColumnResizedEvent,
  ColumnSchemaError,
  ColumnStateUpdate,
  DataSource,
  CellRendererParams,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  EditRendererParams,
  FreezeRowsOptions,
  FrozenRowsState,
  GroupLabelRendererParams,
  HeaderRendererParams,
  GridCore,
  GridIcon,
  GridLabelOverrides,
  HighlightingOptions,
  RowDragEndEvent,
  RowGrouping,
  RowGroupingRejection,
  RowGroupToggledEvent,
  RowLoadingOptions,
  RowResizedEvent,
} from "@gp-grid/core";

// =============================================================================
// Grid Ref Types
// =============================================================================

/** Ref handle exposed by the Grid component */
export interface GridRef<TData = unknown> {
  /** Access to the underlying GridCore instance */
  core: GridCore<TData> | null;
}

// =============================================================================
// Renderer Types
// =============================================================================

/** React cell renderer: A function that renders a cell */
export type ReactCellRenderer = (params: CellRendererParams) => React.ReactNode;

/** React edit renderer: A function that renders the cell while in edit mode */
export type ReactEditRenderer = (params: EditRendererParams) => React.ReactNode;

/** React header renderer: A function that renders a header cell */
export type ReactHeaderRenderer = (
  params: HeaderRendererParams,
) => React.ReactNode;

/** React group label renderer: the label of a group or total row, beside its expander */
export type ReactGroupLabelRenderer = (
  params: GroupLabelRendererParams,
) => React.ReactNode;

/** React group header renderer: renders one fragment of a column group */
export type ReactGroupHeaderRenderer = (
  params: ColumnGroupHeaderParams,
) => React.ReactNode;

/**
 * Header renderer registry, shared by columns and groups: a key receives the
 * params of whichever definition names it.
 */
export type ReactHeaderRendererRegistry = Record<
  string,
  ReactHeaderRenderer | ReactGroupHeaderRenderer
>;

// =============================================================================
// Grid Props
// =============================================================================

/** Grid component props */
export interface GridProps<TData = unknown> {
  /** Column definitions */
  columns: ColumnDefinition[];
  /**
   * Controlled per-column state applied through the core whenever it changes.
   * Explicit commands win over retained user state and definition defaults.
   */
  columnState?: ColumnStateUpdate[];
  /**
   * How displayed column widths are resolved. `"fit"` (default) expands
   * columns to reach the viewport; `"fixed"` keeps declared/overridden pixel
   * widths and scrolls horizontally. Changeable at runtime.
   */
  columnLayout?: ColumnLayoutMode;
  /** Data source for the grid */
  dataSource?: DataSource<TData>;
  /** Legacy: Raw row data (will be wrapped in a client data source) */
  rowData?: TData[];
  /** Row height in pixels */
  rowHeight: number;
  /** Header height in pixels, the default height of every band: Default to row height */
  headerHeight?: number;
  /** Height of each header band, indexed by band; a band without one is `headerHeight`. Changeable at runtime. */
  headerBandHeights?: readonly number[];
  /**
   * Nested header groups over the column ids; every column is referenced
   * once, ungrouped ones at the root. Applied together with `columns`.
   */
  columnGroups?: readonly ColumnGroupChild[];
  /** Budgets of `columnGroups`. Creation-only. */
  columnGroupLimits?: ColumnGroupLimits;
  /** Called when a column change is rejected; the previous schema stays. */
  onColumnSchemaRejected?: (error: ColumnSchemaError) => void;
  /** Overscan: How many rows to render outside the viewport */
  overscan?: number;
  /** CSS px of center columns kept mounted past each clip edge. Default: 240 */
  columnOverscan?: number;
  /** Row loading and cache behavior. Server data sources use paginated loading by default. */
  rowLoading?: RowLoadingOptions;
  /**
   * Number of leading displayed rows kept visible below the header. Applied
   * at runtime; a new identity never rebuilds the core.
   */
  freezeRows?: FreezeRowsOptions;
  /** Called when the effective frozen count or its limiting reason changes. */
  onFrozenRowsChanged?: (state: FrozenRowsState) => void;
  /** Enable/disable sorting globally. Default: true */
  sortingEnabled?: boolean;
  /** Enable dark mode styling: Default to false */
  darkMode?: boolean;
  /** Wheel scroll dampening factor when virtual scrolling is active (0-1): Default 0.1 */
  wheelDampening?: number;
  /** Max accumulated touch-fling velocity (logical px/ms) when scroll virtualization is active. Pair higher values with overscan 10-12. Default: 20 × rowHeight (~20,000 rows/s) */
  maxFlingVelocity?: number;

  /** Renderer registries */
  cellRenderers?: Record<string, ReactCellRenderer>;
  /** Edit renderer registries */
  editRenderers?: Record<string, ReactEditRenderer>;
  /** Header renderer registries, keyed by a column's or a group's `headerRenderer` */
  headerRenderers?: ReactHeaderRendererRegistry;

  /** Global cell renderer */
  cellRenderer?: ReactCellRenderer;
  /** Global edit renderer */
  editRenderer?: ReactEditRenderer;
  /** Global header renderer */
  headerRenderer?: ReactHeaderRenderer;
  /** SVG used by the default header's pin toggle. */
  pinIcon?: GridIcon;

  /** Initial viewport width for SSR (pixels). ResizeObserver takes over on client. */
  initialWidth?: number;
  /** Initial viewport height for SSR (pixels). ResizeObserver takes over on client. */
  initialHeight?: number;

  /** Optional ref to access GridCore API */
  gridRef?: React.MutableRefObject<GridRef<TData> | null>;

  /** Row/column/cell highlighting configuration */
  highlighting?: HighlightingOptions<TData>;

  /** Function to extract unique ID from row. Required when onCellValueChanged is provided. */
  getRowId?: (row: TData) => RowId;
  /** Called when a cell value is changed via editing, fill drag, or paste. Requires getRowId. */
  onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
  /** Called when a write is refused because the bound source is read-only. */
  onWriteRejected?: (event: CellWriteRejectedEvent) => void;
  /** Custom loading component to render instead of default spinner */
  loadingComponent?: React.ComponentType<{ isLoading: boolean }>;
  /** Whether clicking and dragging any cell in a row drags the entire row. Default: false */
  rowDragEntireRow?: boolean;
  /** Called when a row is dropped after dragging. Consumer handles data reordering. */
  onRowDragEnd?: (event: RowDragEndEvent) => void;
  /** Called per column a resize, a fit or a resize key changed. */
  onColumnResized?: (event: ColumnResizedEvent) => void;
  /**
   * Whether the user can resize rows: every cell renders the row edge handle,
   * and Alt+ArrowUp/Down and Alt+Shift+Enter act. Changeable at runtime.
   * Default: false
   */
  rowResize?: boolean;
  /** Called per row a row resize, a fit or a resize key changed. */
  onRowResized?: (event: RowResizedEvent) => void;
  /** Bounds of the fit commands and the row resize gestures. Creation-only. */
  autoFit?: AutoFitOptions;
  /** Called when a column is moved/reordered. */
  onColumnMoved?: (event: ColumnMovedEvent) => void;
  /** Called when a column is pinned or unpinned. */
  onColumnPinned?: (event: ColumnPinnedEvent) => void;
  /** Groups the resident rows; a new value regroups without recreating the core. */
  rowGrouping?: RowGrouping | null;
  /** Column showing a group's expander and label; the first displayed column when absent or hidden. */
  groupLabelColumn?: string;
  /** Renders the label of a group or total row. */
  groupLabelRenderer?: ReactGroupLabelRenderer;
  /** Called per group a pointer or key gesture toggled; commands stay silent. */
  onRowGroupToggled?: (event: RowGroupToggledEvent) => void;
  /** Called when `rowGrouping` cannot apply to the bound source; the grid keeps the source's rows. */
  onRowGroupingRejected?: (rejection: RowGroupingRejection) => void;
  /** Override any user-visible grid label. Unspecified labels fall back to English defaults. */
  labels?: GridLabelOverrides;
}
