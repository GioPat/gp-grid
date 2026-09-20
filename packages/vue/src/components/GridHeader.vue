<script setup lang="ts">
import type { ColumnDefinition, DisplayedColumn, HeaderData } from "@gp-grid/core";
import type { GridCore } from "@gp-grid/core";
import { renderHeader } from "../renderers/headerRenderer";
import type { Row, VueHeaderRenderer } from "../types";

const props = defineProps<{
  headerHeight: number;
  scrollLeft: number;
  contentWidth: number;
  totalWidth: number;
  isLoading: boolean;
  layoutColumns: readonly DisplayedColumn[];
  headers: Map<string, HeaderData>;
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
        v-for="{ column, layoutIndex, offset, width } in props.layoutColumns"
        :key="column.colId ?? column.field"
        class="gp-grid-header-cell"
        :data-col-index="layoutIndex"
        :style="{
          left: `${offset}px`,
          width: `${width}px`,
          height: `${props.headerHeight}px`,
        }"
        @pointerdown="(e: PointerEvent) => props.onHeaderMouseDown(layoutIndex, width, props.headerHeight, e)"
      >
        <component
          :is="renderHeader({
            column,
            colIndex: layoutIndex,
            sortDirection: props.headers.get(column.colId ?? column.field)?.sortDirection,
            sortIndex: props.headers.get(column.colId ?? column.field)?.sortIndex,
            sortable: (column.sortable !== false) && props.sortingEnabled,
            filterable: column.filterable !== false,
            hasFilter: props.headers.get(column.colId ?? column.field)?.hasFilter ?? false,
            core: props.coreRef,
            container: props.outerContainerRef,
            headerRenderers: props.headerRenderers,
            globalHeaderRenderer: props.globalHeaderRenderer,
          })"
        />
        <div
          v-if="column.resizable !== false"
          class="gp-grid-header-resize-handle"
          @pointerdown.stop="(e: PointerEvent) => props.onHeaderResizeMouseDown(layoutIndex, width, e)"
        />
      </div>
    </div>
  </div>
</template>
