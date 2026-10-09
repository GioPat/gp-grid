<script setup lang="ts">
import { computed, inject } from "vue";
import type { ColumnRegion, ColumnWindowSnapshot, ResolvedColumn, SlotData } from "@gp-grid/core";
import GridCell from "./GridCell.vue";
import { HOVER_POSITION, type GridRowCellContext } from "./cell-props";
import { groupDepthStyle, rowGroupAttributes, rowKindClass } from "./row-group-attributes";
import type { Row } from "../types";

const ALL_REGIONS: readonly ColumnRegion[] = ["start", "center", "end"];

const props = defineProps<{
  slot: SlotData<Row>;
  /** ARIA rows the header takes ahead of the body: its band count. */
  headerRowCount: number;
  columnWindow: ColumnWindowSnapshot;
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  displayedIndexOf: (columnId: string) => number;
  width: number;
  cellContext: GridRowCellContext;
  /** Column regions this row renders: the frozen block renders `center` only. */
  regions?: readonly ColumnRegion[];
}>();

const renderedRegions = computed(() => props.regions ?? ALL_REGIONS);
const ariaRowIndex = computed(() => props.slot.rowIndex + props.headerRowCount + 1);
const centerColumns = computed(() =>
  renderedRegions.value.includes("center") ? props.columnWindow.center : []);
const startColumns = computed(() =>
  renderedRegions.value.includes("start") ? props.columnWindow.start : []);
const endColumns = computed(() =>
  renderedRegions.value.includes("end") ? props.columnWindow.end : []);

const hoverPosition = inject(HOVER_POSITION, null);

// A string style is only written when it changes; an object rewrites every key.
// `v-bind` with an object beside `:style` would merge it into an object.
const boxStyle = computed(() =>
  `position: absolute; top: 0; inset-inline-start: 0; transform: translateY(${props.slot.translateY}px); width: ${props.width}px; height: ${props.slot.height}px; display: flex;`);
const rowStyle = computed(() => `${boxStyle.value}${groupDepthStyle(props.slot.row)}`);
const groupAttributes = computed(() => rowGroupAttributes(props.slot.row));

const rowClasses = computed(() => {
  void hoverPosition?.value;
  void props.cellContext.renderToken;
  const highlightRowClasses =
    props.cellContext.coreRef?.highlight?.computeRowClasses(props.slot.rowIndex, props.slot.rowData) ?? [];
  return ["gp-grid-row", rowKindClass(props.slot.row), ...highlightRowClasses]
    .filter(Boolean)
    .join(" ");
});

const cellProps = (column: ResolvedColumn) => ({
  ...props.cellContext,
  rowIndex: props.slot.rowIndex,
  rowData: props.slot.rowData,
  row: props.slot.row,
  rowHeight: props.slot.height,
  generation: props.slot.generation,
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
    :aria-rowindex="ariaRowIndex"
    :style="boxStyle"
  />
  <div
    v-else
    :class="rowClasses"
    role="row"
    :aria-rowindex="ariaRowIndex"
    :data-row-kind="groupAttributes['data-row-kind']"
    :aria-level="groupAttributes['aria-level']"
    :aria-expanded="groupAttributes['aria-expanded']"
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
