<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type {
  ColumnRegion,
  ColumnWindowSnapshot,
  FillHandlePosition,
  ResolvedColumn,
  RowRegionLayout,
  SlotData,
} from "@gp-grid/core";
import GridCell from "./GridCell.vue";
import GridRow from "./GridRow.vue";
import type { GridRowCellContext } from "./cell-props";
import type { Row } from "../types";

const CENTER_REGIONS: readonly ColumnRegion[] = ["center"];

const props = defineProps<{
  rowRegions: RowRegionLayout;
  /** Frozen slots only; the suffix rows stay in the scrolling wrapper. */
  slots: SlotData<Row>[];
  columnWindow: ColumnWindowSnapshot | null;
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  displayedIndexOf: (columnId: string) => number;
  contentWidthPx: number;
  rowHeight: number;
  cellContext: GridRowCellContext;
  /** Frozen-branch handle; `null` when it is hidden or belongs to the suffix. */
  fillHandlePosition: FillHandlePosition | null;
  /** Frozen-branch row drop indicator, placed in the block's inner wrapper. */
  showDropIndicator: boolean;
}>();

const blockWidth = computed(() => `${props.contentWidthPx}px`);

/** A loading placeholder renders no cells, so it has no pin row either. */
const pinRows = computed(() => props.slots.filter((slot) => slot.loading === false));

const startPinColumns = computed(() => props.columnWindow?.start ?? []);
const endPinColumns = computed(() => props.columnWindow?.end ?? []);
const startPinWidth = computed(() => props.columnWindow?.layout.regions.startWidth ?? 0);
const endPinWidth = computed(() => props.columnWindow?.layout.regions.endWidth ?? 0);

/** Zero-height sticky overlay hosting the handle, so it follows its pin region. */
const pinOverlayWidth = (region: "start" | "end"): number | null => {
  if (props.columnWindow === null || props.fillHandlePosition?.region !== region) return null;
  return region === "start" ? startPinWidth.value : endPinWidth.value;
};

const startOverlayWidth = computed(() => pinOverlayWidth("start"));
const endOverlayWidth = computed(() => pinOverlayWidth("end"));

const pinRowStyle = (translateY: number): CSSProperties => ({
  position: "absolute",
  top: 0,
  insetInlineStart: 0,
  transform: `translateY(${translateY}px)`,
  width: `${props.contentWidthPx}px`,
  height: `${props.rowHeight}px`,
  display: "flex",
});

const cellProps = (slot: SlotData<Row>, column: ResolvedColumn) => ({
  ...props.cellContext,
  rowIndex: slot.rowIndex,
  rowData: slot.rowData,
  column,
  displayedIndex: props.displayedIndexOf(column.columnId),
});
</script>

<template>
  <template v-if="props.rowRegions.frozenCount > 0">
    <div
      class="gp-grid-frozen-rows"
      role="presentation"
      :style="{ height: `${props.rowRegions.frozenExtent}px`, width: blockWidth }"
    >
      <div
        class="gp-grid-rows-wrapper"
        role="presentation"
        :style="{ width: blockWidth, transform: 'translateY(0)' }"
      >
        <template v-if="props.columnWindow">
          <GridRow
            v-for="slot in props.slots"
            :key="slot.slotId"
            :slot="slot"
            :column-window="props.columnWindow"
            :displayed-index-of="props.displayedIndexOf"
            :width="props.contentWidthPx"
            :row-height="props.rowHeight"
            :cell-context="props.cellContext"
            :regions="CENTER_REGIONS"
          />
        </template>

        <template v-if="props.fillHandlePosition?.region === 'center'">
          <slot name="fill-handle" />
        </template>

        <template v-if="props.showDropIndicator">
          <slot name="drop-indicator" />
        </template>
      </div>
    </div>

    <div
      class="gp-grid-frozen-pins"
      role="presentation"
      :style="{ marginTop: `${-props.rowRegions.frozenExtent}px` }"
    >
      <template v-if="props.columnWindow">
        <div
          v-for="slot in pinRows"
          :key="slot.slotId"
          class="gp-grid-frozen-pin-row"
          role="presentation"
          :style="pinRowStyle(slot.translateY)"
        >
          <div
            v-if="startPinColumns.length > 0"
            class="gp-grid-pin gp-grid-pin--start"
            role="presentation"
            data-pin-region="start"
            :style="{ width: `${startPinWidth}px` }"
          >
            <GridCell
              v-for="column in startPinColumns"
              :key="column.columnId"
              v-bind="cellProps(slot, column)"
            />
          </div>

          <div
            v-if="endPinColumns.length > 0"
            class="gp-grid-pin gp-grid-pin--end"
            role="presentation"
            data-pin-region="end"
            :style="{ width: `${endPinWidth}px` }"
          >
            <GridCell
              v-for="column in endPinColumns"
              :key="column.columnId"
              v-bind="cellProps(slot, column)"
            />
          </div>
        </div>
      </template>

      <div
        v-if="startOverlayWidth !== null"
        class="gp-grid-pin-overlay gp-grid-pin-overlay--start"
        role="presentation"
        :style="{ width: `${startOverlayWidth}px` }"
      >
        <slot name="fill-handle" />
      </div>

      <div
        v-if="endOverlayWidth !== null"
        class="gp-grid-pin-overlay gp-grid-pin-overlay--end"
        role="presentation"
        :style="{ width: `${endOverlayWidth}px` }"
      >
        <slot name="fill-handle" />
      </div>
    </div>
  </template>
</template>
