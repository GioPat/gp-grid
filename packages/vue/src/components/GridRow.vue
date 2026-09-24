<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { ColumnRegion, ColumnWindowSnapshot, ResolvedColumn, SlotData } from "@gp-grid/core";
import GridCell from "./GridCell.vue";
import type { GridRowCellContext } from "./cell-props";
import type { Row } from "../types";

const ALL_REGIONS: readonly ColumnRegion[] = ["start", "center", "end"];

const props = defineProps<{
  slot: SlotData<Row>;
  columnWindow: ColumnWindowSnapshot;
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  displayedIndexOf: (columnId: string) => number;
  width: number;
  rowHeight: number;
  cellContext: GridRowCellContext;
  /** Column regions this row renders: the frozen block renders `center` only. */
  regions?: readonly ColumnRegion[];
}>();

const renderedRegions = computed(() => props.regions ?? ALL_REGIONS);
const centerColumns = computed(() =>
  renderedRegions.value.includes("center") ? props.columnWindow.center : []);
const startColumns = computed(() =>
  renderedRegions.value.includes("start") ? props.columnWindow.start : []);
const endColumns = computed(() =>
  renderedRegions.value.includes("end") ? props.columnWindow.end : []);

const rowStyle = computed<CSSProperties>(() => ({
  position: "absolute",
  top: 0,
  insetInlineStart: 0,
  transform: `translateY(${props.slot.translateY}px)`,
  width: `${props.width}px`,
  height: `${props.rowHeight}px`,
  display: "flex",
}));

const getRowClasses = (): string => {
  const highlightRowClasses =
    props.cellContext.coreRef?.highlight?.computeRowClasses(props.slot.rowIndex, props.slot.rowData) ?? [];
  return ["gp-grid-row", ...highlightRowClasses].filter(Boolean).join(" ");
};

const cellProps = (column: ResolvedColumn) => ({
  ...props.cellContext,
  rowIndex: props.slot.rowIndex,
  rowData: props.slot.rowData,
  column,
  displayedIndex: props.displayedIndexOf(column.columnId),
});
</script>

<template>
  <!-- C7: an unavailable frozen row has no data and renders no cells. -->
  <div
    v-if="props.slot.loading"
    class="gp-grid-row gp-grid-row--loading"
    role="row"
    :aria-rowindex="props.slot.rowIndex + 1"
    :style="rowStyle"
  />
  <div
    v-else
    :class="getRowClasses()"
    role="row"
    :aria-rowindex="props.slot.rowIndex + 1"
    :style="rowStyle"
  >
    <GridCell
      v-for="column in centerColumns"
      :key="column.columnId"
      v-bind="cellProps(column)"
    />

    <div
      v-if="startColumns.length > 0"
      class="gp-grid-pin gp-grid-pin--start"
      role="presentation"
      data-pin-region="start"
      :style="{ width: `${props.columnWindow.layout.regions.startWidth}px` }"
    >
      <GridCell
        v-for="column in startColumns"
        :key="column.columnId"
        v-bind="cellProps(column)"
      />
    </div>

    <div
      v-if="endColumns.length > 0"
      class="gp-grid-pin gp-grid-pin--end"
      role="presentation"
      data-pin-region="end"
      :style="{ width: `${props.columnWindow.layout.regions.endWidth}px` }"
    >
      <GridCell
        v-for="column in endColumns"
        :key="column.columnId"
        v-bind="cellProps(column)"
      />
    </div>
  </div>
</template>
