// packages/react/src/types.ts

import type {
  Row,
  RowId,
  ColumnDefinition,
  DataSource,
  CellRendererParams,
  CellValueChangedEvent,
  EditRendererParams,
  HeaderRendererParams,
  GridCore,
  HighlightingOptions,
} from "@gp-grid/core";

// =============================================================================
// Grid Ref Types
// =============================================================================

/** Ref handle exposed by the Grid component */
export interface GridRef<TData extends Row = Row> {
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

// =============================================================================
// Grid Props
// =============================================================================

/** Grid component props */
export interface GridProps<TData extends Row = Row> {
  /** Column definitions */
  columns: ColumnDefinition[];
  /** Data source for the grid */
  dataSource?: DataSource<TData>;
  /** Legacy: Raw row data (will be wrapped in a client data source) */
  rowData?: TData[];
  /** Row height in pixels */
  rowHeight: number;
  /** Header height in pixels: Default to row height */
  headerHeight?: number;
  /** Overscan: How many rows to render outside the viewport */
  overscan?: number;
  /** Enable/disable sorting globally. Default: true */
  sortingEnabled?: boolean;
  /** Enable dark mode styling: Default to false */
  darkMode?: boolean;
  /** Wheel scroll dampening factor when virtual scrolling is active (0-1): Default 0.1 */
  wheelDampening?: number;

  /** Renderer registries */
  cellRenderers?: Record<string, ReactCellRenderer>;
  /** Edit renderer registries */
  editRenderers?: Record<string, ReactEditRenderer>;
  /** Header renderer registries */
  headerRenderers?: Record<string, ReactHeaderRenderer>;

  /** Global cell renderer */
  cellRenderer?: ReactCellRenderer;
  /** Global edit renderer */
  editRenderer?: ReactEditRenderer;
  /** Global header renderer */
  headerRenderer?: ReactHeaderRenderer;

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
  /** Called when a cell value is changed via editing or fill drag. Requires getRowId. */
  onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
}
