<script setup lang="ts">
import type { HeaderData, VisibleColumnInfo, ColumnLayout } from "@gp-grid/core";
import type { GridCore } from "@gp-grid/core";
import { renderHeader } from "../renderers/headerRenderer";
import type { Row, VueHeaderRenderer } from "../types";

const props = defineProps<{
  headerHeight: number;
  scrollLeft: number;
  contentWidth: number;
  totalWidth: number;
  isLoading: boolean;
  visibleColumnsWithIndices: VisibleColumnInfo[];
  columnLayout: ColumnLayout;
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
      v-for="region in [
        { name: 'left', items: props.columnLayout.leftPinned.items, left: 0, width: props.columnLayout.leftPinnedWidth, transform: '', zIndex: 3 },
        { name: 'center', items: props.columnLayout.center.items, left: props.columnLayout.leftPinnedWidth, width: Math.max(props.columnLayout.centerWidth, props.contentWidth - props.columnLayout.leftPinnedWidth - props.columnLayout.rightPinnedWidth), transform: 'translate3d(calc(-1 * var(--gp-grid-scroll-left, 0px)), 0, 0)', zIndex: 1 },
        { name: 'right', items: props.columnLayout.rightPinned.items, right: 0, width: props.columnLayout.rightPinnedWidth, transform: '', zIndex: 3 },
      ]"
      :key="region.name"
      class="gp-grid-column-region"
      :style="{
        position: 'absolute',
        top: 0,
        left: region.left === undefined ? undefined : `${region.left}px`,
        right: region.right === undefined ? undefined : `${region.right}px`,
        transform: region.transform,
        width: `${region.width}px`,
        height: `${props.headerHeight}px`,
        zIndex: region.zIndex,
      }"
    >
      <div
        v-for="item in region.items"
        :key="item.key"
        class="gp-grid-header-cell"
        :data-col-index="item.originalIndex"
        :style="{
          left: `${item.left}px`,
          width: `${item.width}px`,
          height: `${props.headerHeight}px`,
        }"
        @pointerdown="(e: PointerEvent) => props.onHeaderMouseDown(item.originalIndex, item.width, props.headerHeight, e)"
      >
        <component
          :is="renderHeader({
            column: item.column,
            colIndex: item.originalIndex,
            sortDirection: props.headers.get(item.originalIndex)?.sortDirection,
            sortIndex: props.headers.get(item.originalIndex)?.sortIndex,
            sortable: (item.column.sortable !== false) && props.sortingEnabled,
            filterable: item.column.filterable !== false,
            hasFilter: props.headers.get(item.originalIndex)?.hasFilter ?? false,
            core: props.coreRef,
            container: props.outerContainerRef,
            headerRenderers: props.headerRenderers,
            globalHeaderRenderer: props.globalHeaderRenderer,
          })"
        />
        <div
          v-if="item.column.resizable !== false"
          :class="[
            'gp-grid-header-resize-handle',
            item.region === 'right' ? 'gp-grid-header-resize-handle--inside' : '',
          ].filter(Boolean).join(' ')"
          @pointerdown.stop="(e: PointerEvent) => props.onHeaderResizeMouseDown(item.originalIndex, item.width, e)"
        />
      </div>
    </div>
  </div>
</template>
