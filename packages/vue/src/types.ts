// packages/vue/src/types.ts

import type { VNode, Component } from "vue";
import type {
  Row,
  ColumnDefinition,
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,
  DataSource,
} from "gp-grid-core";

// =============================================================================
// Vue Renderer Types
// =============================================================================

/**
 * Vue cell renderer - can return a VNode or a string
 */
export type VueCellRenderer<TData extends Row = Row> = (
  params: CellRendererParams<TData>,
) => VNode | string | null;

/**
 * Vue edit renderer - returns a VNode for the edit input
 */
export type VueEditRenderer<TData extends Row = Row> = (
  params: EditRendererParams<TData>,
) => VNode | null;

/**
 * Vue header renderer - returns a VNode for the header content
 */
export type VueHeaderRenderer = (
  params: HeaderRendererParams,
) => VNode | string | null;

// =============================================================================
// Component Props Types
// =============================================================================

export interface GpGridProps<TData extends Row = Row> {
  columns: ColumnDefinition[];
  dataSource?: DataSource<TData>;
  rowData?: TData[];
  rowHeight: number;
  headerHeight?: number;
  overscan?: number;
  sortingEnabled?: boolean;
  darkMode?: boolean;
  wheelDampening?: number;
  cellRenderers?: Record<string, VueCellRenderer<TData> | Component>;
  editRenderers?: Record<string, VueEditRenderer<TData> | Component>;
  headerRenderers?: Record<string, VueHeaderRenderer | Component>;
  cellRenderer?: VueCellRenderer<TData> | Component;
  editRenderer?: VueEditRenderer<TData> | Component;
  headerRenderer?: VueHeaderRenderer | Component;
}
