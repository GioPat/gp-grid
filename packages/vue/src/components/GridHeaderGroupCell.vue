<script setup lang="ts">
import { computed } from "vue";
import type { ColumnGroupLookup, GridCore, HeaderFragment, ResolvedColumn } from "@gp-grid/core";
import { renderGroupHeader } from "../renderers/headerRenderer";
import type { Row, VueHeaderRendererRegistry } from "../types";

// One fragment of a column group (D9): a header with no action. It never
// carries `data-col-index`, which the filter popup and the fit read as a leaf.
const props = defineProps<{
  fragment: HeaderFragment;
  id: string;
  /** Top of the fragment's band. */
  top: number;
  /** The band's height. */
  height: number;
  /** `ColumnLayoutSnapshot.columns`, which the fragment's leaves index. */
  layoutColumns: readonly ResolvedColumn[];
  coreRef: GridCore<Row> | null;
  /** Resolves the group from the `columnGroups` prop while the core is null. */
  lookupGroup: ColumnGroupLookup;
  headerRenderers: VueHeaderRendererRegistry;
}>();

// A new hierarchy rebuilds every fragment, so the lookup follows `fragment`.
const group = computed(() =>
  props.coreRef === null
    ? props.lookupGroup(props.fragment.groupId)
    : props.coreRef.columns.getGroup(props.fragment.groupId),
);

const content = () =>
  renderGroupHeader({
    fragment: props.fragment,
    group: group.value,
    layoutColumns: props.layoutColumns,
    headerRenderers: props.headerRenderers,
  });
</script>

<template>
  <div
    :id="props.id"
    :class="[
      'gp-grid-header-cell',
      'gp-grid-header-group',
      { 'gp-grid-header-cell--wrap': group?.wrapHeaderText === true },
    ]"
    role="columnheader"
    :aria-colindex="props.fragment.firstDisplayIndex + 1"
    :aria-colspan="props.fragment.leafCount"
    :aria-rowindex="props.fragment.band + 1"
    :data-group-id="props.fragment.groupId"
    :data-band="props.fragment.band"
    :data-fragment="props.fragment.fragmentId"
    :style="{
      insetInlineStart: `${props.fragment.regionOffset}px`,
      width: `${props.fragment.width}px`,
      height: `${props.height}px`,
      top: `${props.top}px`,
    }"
  >
    <component :is="content()" />
  </div>
</template>
