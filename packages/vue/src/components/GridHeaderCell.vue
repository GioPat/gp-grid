<script setup lang="ts">
import type { GridCore, GridIcon, GridLabels, HeaderData, ResizeTarget, ResolvedColumn } from "@gp-grid/core";
import { renderHeader } from "../renderers/headerRenderer";
import type { Row, VueHeaderRenderer, VueHeaderRendererRegistry } from "../types";
import ResizeHandle from "./ResizeHandle.vue";

// The placement is passed as primitives so a header re-render on scroll
// re-renders no cell.
const props = defineProps<{
  column: ResolvedColumn;
  /** 0-based index in the displayed columns, for `aria-colindex`. */
  displayedIndex: number;
  id: string;
  /** Top of the leaf's first band. */
  top: number;
  /** From its first band to the bottom of the header. */
  height: number;
  /** Grouped only: 1-based first band. */
  bandRowIndex?: number;
  /** Grouped only: bands the leaf spans. */
  bandRowSpan?: number;
  /** Grouped only: ids of its mounted ancestor fragments, outermost first. */
  describedBy?: string;
  headers: Map<string, HeaderData>;
  sortingEnabled: boolean;
  rtl: boolean;
  labels: GridLabels;
  onHeaderMouseDown: (colIndex: number, colWidth: number, colHeight: number, e: PointerEvent) => void;
  onHeaderResizeMouseDown: (colIndex: number, colWidth: number, e: PointerEvent) => void;
  onResizeDoubleClick: (target: ResizeTarget) => void;
  coreRef: GridCore<Row> | null;
  outerContainerRef: HTMLDivElement | null;
  headerRenderers: VueHeaderRendererRegistry;
  globalHeaderRenderer?: VueHeaderRenderer;
  pinIcon: GridIcon;
}>();

const headerInfo = (): HeaderData | undefined => props.headers.get(props.column.columnId);

const headerContent = () =>
  renderHeader({
    column: props.column.column,
    colIndex: props.column.layoutIndex,
    sortDirection: headerInfo()?.sortDirection,
    sortIndex: headerInfo()?.sortIndex,
    sortable: props.column.column.sortable !== false && props.sortingEnabled,
    filterable: props.column.column.filterable !== false,
    hasFilter: headerInfo()?.hasFilter ?? false,
    rtl: props.rtl,
    labels: props.labels,
    core: props.coreRef,
    container: props.outerContainerRef,
    headerRenderers: props.headerRenderers,
    globalHeaderRenderer: props.globalHeaderRenderer,
    pinIcon: props.pinIcon,
  });
</script>

<template>
  <div
    :id="props.id"
    :class="['gp-grid-header-cell', { 'gp-grid-header-cell--wrap': props.column.column.wrapHeaderText === true }]"
    role="columnheader"
    :aria-colindex="props.displayedIndex + 1"
    :aria-rowindex="props.bandRowIndex"
    :aria-rowspan="props.bandRowSpan"
    :aria-describedby="props.describedBy"
    :data-col-index="props.column.layoutIndex"
    :data-cell-region="props.column.region"
    :style="{
      insetInlineStart: `${props.column.regionOffset}px`,
      width: `${props.column.width}px`,
      height: `${props.height}px`,
      top: `${props.top}px`,
    }"
    @pointerdown="(e) => props.onHeaderMouseDown(props.column.layoutIndex, props.column.width, props.height, e)"
  >
    <component :is="headerContent()" />
    <ResizeHandle
      v-if="props.column.column.resizable !== false"
      axis="column"
      :index="props.column.layoutIndex"
      :size="props.column.width"
      :on-pointer-down="props.onHeaderResizeMouseDown"
      :on-double-click="props.onResizeDoubleClick"
    />
  </div>
</template>
