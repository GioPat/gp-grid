<script setup lang="ts">
import { computed } from "vue";
import type { HierarchyGroupRow, HierarchyTotalRow } from "@gp-grid/core";
import { renderGroupLabel } from "../renderers/groupLabelRenderer";
import type { RowGroupCellContext } from "./row-group-attributes";

/** Content of a group or total row's label cell: the expander and the label. */
const props = defineProps<{
  row: HierarchyGroupRow | HierarchyTotalRow;
  rowIndex: number;
  label: string;
  context: RowGroupCellContext;
}>();

const isGroup = computed(() => props.row.kind === "group");

const toggleClass = computed(() => [
  "gp-grid-group-toggle",
  isGroup.value ? "" : "gp-grid-group-toggle--none",
  props.row.kind === "group" && props.row.expanded ? "gp-grid-group-toggle--expanded" : "",
].filter(Boolean).join(" "));

const onPointerDown = (e: PointerEvent): void => {
  if (isGroup.value) props.context.onTogglePointerDown(props.rowIndex, e);
};

const toggle = (): void => {
  if (isGroup.value) props.context.onToggle(props.rowIndex);
};

const labelContent = () => renderGroupLabel(
  { row: props.row, viewIndex: props.rowIndex, label: props.label, toggle },
  props.context.renderer,
);
</script>

<template>
  <!-- The cell's own double-click toggles too, so the expander's must not reach it (D5). -->
  <span
    :class="toggleClass"
    aria-hidden="true"
    @pointerdown="onPointerDown"
    @dblclick.stop
  />
  <span class="gp-grid-group-label">
    <component :is="labelContent()" />
  </span>
</template>
