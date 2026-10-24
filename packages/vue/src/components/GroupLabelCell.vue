<script setup lang="ts">
import { computed, type VNode } from "vue";
import type { GroupLabelRendererParams, HierarchyGroupRow, HierarchyTotalRow } from "@gp-grid/core";
import { groupLabelParams, groupToggleClassName } from "@gp-grid/core";
import { toVNode } from "../renderers/utils";
import type { RowGroupCellContext } from "../composables/useRowGroupingSync";

/** Content of a group or total row's label cell: the expander and the label. */
const props = defineProps<{
  row: HierarchyGroupRow | HierarchyTotalRow;
  rowIndex: number;
  label: string;
  context: RowGroupCellContext;
}>();

const toggleClass = computed(() => groupToggleClassName(props.row));

const onPointerDown = (e: PointerEvent): void => {
  if (props.row.kind === "group") props.context.onTogglePointerDown(props.rowIndex, e);
};

const params = computed(() =>
  groupLabelParams(props.row, props.rowIndex, props.label, props.context.onToggle));

type GroupLabelRenderFn = (params: GroupLabelRendererParams) => VNode | string | null;

// A component renderer mounts once and takes the params as props, so its state
// survives a label update; a function renderer is re-run instead.
const renderFn = computed(() => {
  const renderer = props.context.renderer;
  return typeof renderer === "function" ? (renderer as GroupLabelRenderFn) : null;
});
const componentRenderer = computed(() => {
  const renderer = props.context.renderer;
  return renderer === undefined || typeof renderer === "function" ? null : renderer;
});
const renderedLabel = computed(() => {
  const render = renderFn.value;
  return render === null ? null : toVNode(render(params.value));
});
</script>

<template>
  <!-- The cell's own double-click toggles too, so the expander's must not reach it. -->
  <span
    :class="toggleClass"
    aria-hidden="true"
    @pointerdown="onPointerDown"
    @dblclick.stop
  />
  <span class="gp-grid-group-label">
    <component :is="componentRenderer" v-if="componentRenderer !== null" v-bind="params" />
    <component :is="renderedLabel" v-else-if="renderedLabel !== null" />
    <template v-else>{{ props.label }}</template>
  </span>
</template>
