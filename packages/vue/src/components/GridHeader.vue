<script setup lang="ts">
import { computed, useId } from "vue";
import {
  createColumnGroupLookup,
  fragmentHeaderBox,
  fragmentHeaderId,
  leafHeaderBox,
  leafHeaderId,
  resolveHeaderAssociations,
} from "@gp-grid/core";
import type {
  ColumnGroupChild,
  ColumnWindowSnapshot,
  GridCore,
  GridIcon,
  GridLabels,
  HeaderAssociations,
  HeaderBandLayout,
  HeaderData,
  HeaderFragment,
  ResizeTarget,
  ResolvedColumn,
} from "@gp-grid/core";
import GridHeaderCell from "./GridHeaderCell.vue";
import GridHeaderGroupCell from "./GridHeaderGroupCell.vue";
import type { Row, VueHeaderRenderer, VueHeaderRendererRegistry } from "../types";

/**
 * Header: the center strip translates with the body scroll, while the two pin
 * containers stay absolute at their viewport edges above it. With more than
 * one band the root is a row group whose band rows own the mounted headers.
 */
const props = defineProps<{
  headerBands: HeaderBandLayout;
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
  rtl: boolean;
  labels: GridLabels;
  onHeaderMouseDown: (colIndex: number, colWidth: number, colHeight: number, e: PointerEvent) => void;
  onHeaderResizeMouseDown: (colIndex: number, colWidth: number, e: PointerEvent) => void;
  onResizeDoubleClick: (target: ResizeTarget) => void;
  coreRef: GridCore<Row> | null;
  /** The `columnGroups` prop: fragments resolve their group here while the core is null. */
  columnGroups?: readonly ColumnGroupChild[];
  outerContainerRef: HTMLDivElement | null;
  headerRenderers: VueHeaderRendererRegistry;
  globalHeaderRenderer?: VueHeaderRenderer;
  pinIcon: GridIcon;
}>();

const instance = useId();
const lookupGroup = computed(() => createColumnGroupLookup(props.columnGroups));

const associations = computed<HeaderAssociations | null>(() => {
  const { columnWindow, headerBands, displayedIndexOf } = props;
  if (columnWindow === null || headerBands.count < 2) return null;
  return resolveHeaderAssociations({
    instance,
    columnWindow,
    bandCount: headerBands.count,
    displayedIndexOf,
  });
});

const totalHeight = computed(() => `${props.headerBands.totalHeight}px`);
const start = (): readonly ResolvedColumn[] => props.columnWindow?.start ?? [];
const center = (): readonly ResolvedColumn[] => props.columnWindow?.center ?? [];
const end = (): readonly ResolvedColumn[] => props.columnWindow?.end ?? [];
const regions = () => props.columnWindow?.layout.regions;
const groups = () => props.columnWindow?.groups;

const leafBands = (column: ResolvedColumn) => {
  const resolved = associations.value;
  if (resolved === null) return {};
  return {
    bandRowIndex: column.headerBand + 1,
    bandRowSpan: props.headerBands.count - column.headerBand,
    describedBy: resolved.describedBy.get(column.columnId),
  };
};

const cellProps = (column: ResolvedColumn) => {
  const box = leafHeaderBox(props.headerBands, column.headerBand);
  return {
    column,
    displayedIndex: props.displayedIndexOf(column.columnId),
    id: leafHeaderId(instance, column.columnId),
    top: box.top,
    height: box.height,
    ...leafBands(column),
    headers: props.headers,
    sortingEnabled: props.sortingEnabled,
    rtl: props.rtl,
    labels: props.labels,
    onHeaderMouseDown: props.onHeaderMouseDown,
    onHeaderResizeMouseDown: props.onHeaderResizeMouseDown,
    onResizeDoubleClick: props.onResizeDoubleClick,
    coreRef: props.coreRef,
    outerContainerRef: props.outerContainerRef,
    headerRenderers: props.headerRenderers,
    globalHeaderRenderer: props.globalHeaderRenderer,
    pinIcon: props.pinIcon,
  };
};

const fragmentProps = (fragment: HeaderFragment) => {
  const box = fragmentHeaderBox(props.headerBands, fragment.band);
  return {
    fragment,
    id: fragmentHeaderId(instance, fragment.fragmentId),
    top: box.top,
    height: box.height,
    layoutColumns: props.columnWindow?.layout.columns ?? [],
    coreRef: props.coreRef,
    lookupGroup: lookupGroup.value,
    headerRenderers: props.headerRenderers,
  };
};
</script>

<template>
  <div
    :class="['gp-grid-header', { 'gp-grid-header--loading': props.isLoading }]"
    :role="associations === null ? 'row' : 'rowgroup'"
    :aria-rowindex="associations === null ? 1 : undefined"
    :style="{ height: totalHeight }"
  >
    <div
      v-for="(owns, band) in associations?.owns ?? []"
      :key="band"
      role="row"
      :aria-rowindex="band + 1"
      :aria-owns="owns === '' ? undefined : owns"
    />

    <div
      role="presentation"
      :style="{
        position: 'absolute',
        top: 0,
        insetInlineStart: 0,
        transform: `translateX(${-props.scrollLeft}px)`,
        width: `${Math.max(props.contentWidth, props.totalWidth)}px`,
        height: totalHeight,
      }"
    >
      <GridHeaderGroupCell
        v-for="fragment in groups()?.center"
        :key="fragment.fragmentId"
        v-bind="fragmentProps(fragment)"
      />
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
        height: totalHeight,
      }"
    >
      <GridHeaderGroupCell
        v-for="fragment in groups()?.start"
        :key="fragment.fragmentId"
        v-bind="fragmentProps(fragment)"
      />
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
        height: totalHeight,
      }"
    >
      <GridHeaderGroupCell
        v-for="fragment in groups()?.end"
        :key="fragment.fragmentId"
        v-bind="fragmentProps(fragment)"
      />
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
        height: totalHeight,
      }"
    />
  </div>
</template>
