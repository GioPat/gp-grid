<script setup lang="ts">
import type { ColumnWindowSnapshot, GridCore, GridIcon, GridLabels, HeaderData, ResolvedColumn } from "@gp-grid/core";
import GridHeaderCell from "./GridHeaderCell.vue";
import type { Row, VueHeaderRenderer } from "../types";

const props = defineProps<{
  headerHeight: number;
  /** DOM scroll offset (physical: negative in RTL); the strip negates it. */
  scrollLeft: number;
  contentWidth: number;
  totalWidth: number;
  viewportWidth: number;
  isLoading: boolean;
  columnWindow: ColumnWindowSnapshot | null;
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  displayedIndexOf: (columnId: string) => number;
  headers: Map<string, HeaderData>;
  sortingEnabled: boolean;
  labels: GridLabels;
  onHeaderMouseDown: (colIndex: number, colWidth: number, colHeight: number, e: PointerEvent) => void;
  onHeaderResizeMouseDown: (colIndex: number, colWidth: number, e: PointerEvent) => void;
  coreRef: GridCore<Row> | null;
  outerContainerRef: HTMLDivElement | null;
  headerRenderers: Record<string, VueHeaderRenderer>;
  globalHeaderRenderer?: VueHeaderRenderer;
  pinIcon: GridIcon;
}>();

const start = (): readonly ResolvedColumn[] => props.columnWindow?.start ?? [];
const center = (): readonly ResolvedColumn[] => props.columnWindow?.center ?? [];
const end = (): readonly ResolvedColumn[] => props.columnWindow?.end ?? [];
const regions = () => props.columnWindow?.layout.regions;

const cellProps = (column: ResolvedColumn) => ({
  column,
  displayedIndex: props.displayedIndexOf(column.columnId),
  headerHeight: props.headerHeight,
  headers: props.headers,
  sortingEnabled: props.sortingEnabled,
  labels: props.labels,
  onHeaderMouseDown: props.onHeaderMouseDown,
  onHeaderResizeMouseDown: props.onHeaderResizeMouseDown,
  coreRef: props.coreRef,
  outerContainerRef: props.outerContainerRef,
  headerRenderers: props.headerRenderers,
  globalHeaderRenderer: props.globalHeaderRenderer,
  pinIcon: props.pinIcon,
});
</script>

<template>
  <div
    :class="['gp-grid-header', { 'gp-grid-header--loading': props.isLoading }]"
    role="row"
    :style="{ height: `${props.headerHeight}px` }"
  >
    <div
      role="presentation"
      :style="{
        position: 'absolute',
        top: 0,
        insetInlineStart: 0,
        transform: `translateX(${-props.scrollLeft}px)`,
        width: `${Math.max(props.contentWidth, props.totalWidth)}px`,
        height: `${props.headerHeight}px`,
      }"
    >
      <GridHeaderCell
        v-for="column in center()"
        :key="column.columnId"
        v-bind="cellProps(column)"
      />
    </div>

    <div
      v-if="regions() && start().length > 0"
      class="gp-grid-pin-header"
      role="presentation"
      data-pin-region="start"
      :style="{
        insetInlineStart: 0,
        width: `${regions()!.startWidth}px`,
        height: `${props.headerHeight}px`,
      }"
    >
      <GridHeaderCell
        v-for="column in start()"
        :key="column.columnId"
        v-bind="cellProps(column)"
      />
    </div>

    <div
      v-if="regions() && end().length > 0"
      class="gp-grid-pin-header"
      role="presentation"
      data-pin-region="end"
      :style="{
        insetInlineStart: `${regions()!.endOffset}px`,
        width: `${regions()!.endWidth}px`,
        height: `${props.headerHeight}px`,
      }"
    >
      <GridHeaderCell
        v-for="column in end()"
        :key="column.columnId"
        v-bind="cellProps(column)"
      />
    </div>

    <div
      v-if="props.viewportWidth > 0"
      class="gp-grid-header-gutter"
      role="presentation"
      :style="{
        insetInlineStart: `${props.viewportWidth}px`,
        height: `${props.headerHeight}px`,
      }"
    />
  </div>
</template>
