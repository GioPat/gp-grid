<script setup lang="ts">
import { computed } from "vue";
import type { ResizeTarget } from "@gp-grid/core";

const AXIS_CLASS = {
  column: "gp-grid-header-resize-handle",
  row: "gp-grid-row-resize-handle",
} as const;

const props = defineProps<{
  axis: ResizeTarget["axis"];
  /** Layout index of a column, view index of a row. */
  index: number;
  /** Displayed width or row height a drag starts from. */
  size: number;
  active?: boolean;
  onPointerDown: (index: number, size: number, e: PointerEvent) => void;
  onDoubleClick: (target: ResizeTarget) => void;
}>();

const target = computed<ResizeTarget>(() =>
  props.axis === "column"
    ? { axis: "column", colIndex: props.index }
    : { axis: "row", rowIndex: props.index });

const classes = computed(() => {
  const base = AXIS_CLASS[props.axis];
  return props.active === true ? [base, `${base}--active`] : [base];
});
</script>

<template>
  <!-- Pointer-only: the grid keys are its keyboard equivalent. Pointer down and
       double-click stop here so the cell or header never selects, edits or peeks. -->
  <div
    :class="classes"
    aria-hidden="true"
    @pointerdown.stop="(e) => props.onPointerDown(props.index, props.size, e)"
    @dblclick.stop="() => props.onDoubleClick(target)"
  />
</template>
