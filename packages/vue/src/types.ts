// packages/vue/src/types.ts

import type { VNode, Component } from "vue";
import type {
  RowId,
  ColumnDefinition as CoreColumnDefinition,
  CellRendererParams,
  CellValueChangedEvent,
  EditRendererParams,
  HeaderRendererParams,
  DataSource,
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
  dataSource?: DataSource<TData>;
  rowData?: TData[];
  rowHeight: number;
  headerHeight?: number;
  overscan?: number;
  sortingEnabled?: boolean;
  darkMode?: boolean;
  wheelDampening?: number;
  cellRenderers?: Record<string, VueCellRenderer<TData>>;
  editRenderers?: Record<string, VueEditRenderer<TData>>;
  headerRenderers?: Record<string, VueHeaderRenderer>;
  cellRenderer?: VueCellRenderer<TData>;
  editRenderer?: VueEditRenderer<TData>;
  headerRenderer?: VueHeaderRenderer;
  /** Function to extract unique ID from row. Required when onCellValueChanged is provided. */
  getRowId?: (row: TData) => RowId;
  /** Called when a cell value is changed via editing, fill drag, or paste. Requires getRowId. */
  onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
  /** Custom loading component to render instead of default spinner */
  loadingComponent?: Component<{ isLoading: boolean }>;
}
