<script setup lang="ts">
import type { ColumnWindowSnapshot, ResolvedColumn, SlotData } from "@gp-grid/core";
import GridCell from "./GridCell.vue";
import type { GridRowCellContext } from "./cell-props";
import type { Row } from "../types";

const props = defineProps<{
  slot: SlotData<Row>;
  columnWindow: ColumnWindowSnapshot;
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  displayedIndexOf: (columnId: string) => number;
  width: number;
  rowHeight: number;
  cellContext: GridRowCellContext;
}>();

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
  <div
    :class="getRowClasses()"
    role="row"
    :aria-rowindex="props.slot.rowIndex + 1"
    :style="{
      position: 'absolute',
      top: 0,
      insetInlineStart: 0,
      transform: `translateY(${props.slot.translateY}px)`,
      width: `${props.width}px`,
      height: `${props.rowHeight}px`,
      display: 'flex',
    }"
  >
    <GridCell
      v-for="column in props.columnWindow.center"
      :key="column.columnId"
      v-bind="cellProps(column)"
    />

    <div
      v-if="props.columnWindow.start.length > 0"
      class="gp-grid-pin gp-grid-pin--start"
      role="presentation"
      data-pin-region="start"
      :style="{ width: `${props.columnWindow.layout.regions.startWidth}px` }"
    >
      <GridCell
        v-for="column in props.columnWindow.start"
        :key="column.columnId"
        v-bind="cellProps(column)"
      />
    </div>

    <div
      v-if="props.columnWindow.end.length > 0"
      class="gp-grid-pin gp-grid-pin--end"
      role="presentation"
      data-pin-region="end"
      :style="{ width: `${props.columnWindow.layout.regions.endWidth}px` }"
    >
      <GridCell
        v-for="column in props.columnWindow.end"
        :key="column.columnId"
        v-bind="cellProps(column)"
      />
    </div>
  </div>
</template>
