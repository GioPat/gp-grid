<script setup lang="ts">
import type { ColumnDefinition, HeaderData, VisibleColumnInfo } from "@gp-grid/core";
import type { GridCore, Row } from "@gp-grid/core";
import { renderHeader } from "../renderers/headerRenderer";
import type { VueHeaderRenderer } from "../types";

const props = defineProps<{
  headerHeight: number;
  scrollLeft: number;
  contentWidth: number;
  totalWidth: number;
  isLoading: boolean;
  visibleColumnsWithIndices: VisibleColumnInfo[];
  columnPositions: number[];
  columnWidths: number[];
  headers: Map<number, HeaderData>;
  sortingEnabled: boolean;
  onHeaderMouseDown: (colIndex: number, colWidth: number, colHeight: number, e: PointerEvent) => void;
  onHeaderResizeMouseDown: (colIndex: number, colWidth: number, e: PointerEvent) => void;
  coreRef: GridCore<Row> | null;
  outerContainerRef: HTMLDivElement | null;
  headerRenderers: Record<string, VueHeaderRenderer>;
  globalHeaderRenderer?: VueHeaderRenderer;
}>();
</script>

<template>
  <div
    :class="['gp-grid-header', { 'gp-grid-header--loading': props.isLoading }]"
    :style="{ height: `${props.headerHeight}px` }"
  >
    <div
      :style="{
        position: 'absolute',
        top: 0,
        left: 0,
        transform: `translateX(${-props.scrollLeft}px)`,
        width: `${Math.max(props.contentWidth, props.totalWidth)}px`,
        height: `${props.headerHeight}px`,
      }"
    >
      <div
        v-for="({ column, originalIndex }, visibleIndex) in props.visibleColumnsWithIndices"
        :key="column.colId ?? column.field"
        class="gp-grid-header-cell"
        :data-col-index="originalIndex"
        :style="{
          left: `${props.columnPositions[visibleIndex]}px`,
          width: `${props.columnWidths[visibleIndex]}px`,
          height: `${props.headerHeight}px`,
        }"
        @pointerdown="(e: PointerEvent) => props.onHeaderMouseDown(originalIndex, props.columnWidths[visibleIndex] ?? 0, props.headerHeight, e)"
      >
        <component
          :is="renderHeader({
            column,
            colIndex: originalIndex,
            sortDirection: props.headers.get(originalIndex)?.sortDirection,
            sortIndex: props.headers.get(originalIndex)?.sortIndex,
            sortable: (column.sortable !== false) && props.sortingEnabled,
            filterable: column.filterable !== false,
            hasFilter: props.headers.get(originalIndex)?.hasFilter ?? false,
            core: props.coreRef,
            container: props.outerContainerRef,
            headerRenderers: props.headerRenderers,
            globalHeaderRenderer: props.globalHeaderRenderer,
          })"
        />
        <div
          v-if="column.resizable !== false"
          class="gp-grid-header-resize-handle"
          @pointerdown.stop="(e: PointerEvent) => props.onHeaderResizeMouseDown(originalIndex, props.columnWidths[visibleIndex] ?? 0, e)"
        />
      </div>
    </div>
  </div>
</template>
