<script setup lang="ts">
import { computed } from "vue";
import { readFixedOrigin } from "@gp-grid/core";
import type { ColumnDefinition, DragState, FixedOrigin } from "@gp-grid/core";

const props = defineProps<{
  dragState: DragState;
  columns: ColumnDefinition[];
  totalHeaderHeight: number;
  totalWidth: number;
  host: HTMLElement | null;
}>();

const NO_ORIGIN: FixedOrigin = { top: 0, left: 0 };

const dragType = computed(() => props.dragState.dragType);

// Read once per drag: the probe forces a layout, too costly on every move.
const origin = computed((): FixedOrigin => {
  const hasGhost = dragType.value === "column-move" || dragType.value === "row-drag";
  return hasGhost && props.host ? readFixedOrigin(props.host) : NO_ORIGIN;
});

const columnMove = computed(() =>
  dragType.value === "column-move" ? props.dragState.columnMove : null,
);

const rowDrag = computed(() =>
  dragType.value === "row-drag" ? props.dragState.rowDrag : null,
);

const columnMoveText = computed(() => {
  const column = columnMove.value ? props.columns[columnMove.value.sourceColIndex] : undefined;
  return column?.headerName ?? column?.field ?? "";
});
</script>

<template>
  <template v-if="columnMove">
    <div
      class="gp-grid-column-move-ghost"
      :style="{
        left: `${columnMove.currentX - columnMove.ghostWidth / 2 - origin.left}px`,
        top: `${columnMove.currentY - columnMove.ghostHeight / 2 - origin.top}px`,
        width: `${columnMove.ghostWidth}px`,
        height: `${columnMove.ghostHeight}px`,
      }"
    >
      {{ columnMoveText }}
    </div>
    <div
      v-if="columnMove.dropTargetIndex !== null"
      class="gp-grid-column-drop-indicator"
      :style="{
        insetInlineStart: `${columnMove.dropIndicatorX}px`,
        height: `${totalHeaderHeight}px`,
      }"
    />
  </template>
  <div
    v-else-if="rowDrag"
    class="gp-grid-row-drag-ghost"
    :style="{
      left: `${rowDrag.currentX + 12 - origin.left}px`,
      top: `${rowDrag.currentY - rowDrag.sourceRowHeight / 2 - origin.top}px`,
      width: `${Math.min(300, totalWidth)}px`,
      height: `${rowDrag.sourceRowHeight}px`,
    }"
  />
</template>
