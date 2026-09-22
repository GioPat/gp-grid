<script setup lang="ts">
import type { GridCore, GridIcon, GridLabels, HeaderData, ResolvedColumn } from "@gp-grid/core";
import { renderHeader } from "../renderers/headerRenderer";
import type { Row, VueHeaderRenderer } from "../types";

const props = defineProps<{
  column: ResolvedColumn;
  /** 0-based index in the displayed columns, for `aria-colindex`. */
  displayedIndex: number;
  headerHeight: number;
  headers: Map<string, HeaderData>;
  sortingEnabled: boolean;
  rtl: boolean;
  labels: GridLabels;
  onHeaderMouseDown: (colIndex: number, colWidth: number, colHeight: number, e: PointerEvent) => void;
  onHeaderResizeMouseDown: (colIndex: number, colWidth: number, e: PointerEvent) => void;
  coreRef: GridCore<Row> | null;
  outerContainerRef: HTMLDivElement | null;
  headerRenderers: Record<string, VueHeaderRenderer>;
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
    class="gp-grid-header-cell"
    role="columnheader"
    :aria-colindex="props.displayedIndex + 1"
    :data-col-index="props.column.layoutIndex"
    :data-cell-region="props.column.region"
    :style="{
      insetInlineStart: `${props.column.regionOffset}px`,
      width: `${props.column.width}px`,
      height: `${props.headerHeight}px`,
    }"
    @pointerdown="(e) => props.onHeaderMouseDown(props.column.layoutIndex, props.column.width, props.headerHeight, e)"
  >
    <component :is="headerContent()" />
    <div
      v-if="props.column.column.resizable !== false"
      class="gp-grid-header-resize-handle"
      @pointerdown.stop="(e) => props.onHeaderResizeMouseDown(props.column.layoutIndex, props.column.width, e)"
    />
  </div>
</template>
