<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watchEffect } from "vue";
import type {
  CellValue,
  ColumnDefinition,
  ColumnFilterModel,
  FilterRendererParams,
  GridLabels,
} from "@gp-grid/core";
import { calculateFilterPopupPosition, formatLabel } from "@gp-grid/core";
import { useFilterPopup } from "../composables/useFilterPopup";
import TextFilterContent from "./TextFilterContent.vue";
import NumberFilterContent from "./NumberFilterContent.vue";
import DateFilterContent from "./DateFilterContent.vue";
import { CustomFilterContent, resolveFilterRenderer } from "../renderers/filterRenderer";
import type { VueFilterRenderer } from "../types";

const props = defineProps<{
  column: ColumnDefinition;
  colIndex: number;
  containerRef: HTMLDivElement | null;
  distinctValues: CellValue[];
  currentFilter?: ColumnFilterModel;
  labels: GridLabels;
  filterRenderers?: Record<string, VueFilterRenderer>;
  globalFilterRenderer?: VueFilterRenderer;
}>();

const emit = defineEmits<{
  apply: [colId: string, filter: ColumnFilterModel | null];
  close: [];
}>();

const popupRef = ref<HTMLDivElement | null>(null);

// Dynamic popup position state
const popupTop = ref(0);
const popupLeft = ref(0);
const popupMinWidth = ref(200);
const isPositioned = ref(false);

// Use the filter popup composable for click-outside and escape key handling
useFilterPopup(popupRef, {
  onClose: () => emit("close"),
  ignoreSelector: ".gp-grid-filter-icon",
});

const colId = computed(() => props.column.colId ?? props.column.field);

function handleApply(filter: ColumnFilterModel | null): void {
  emit("apply", colId.value, filter);
  emit("close");
}

function handleClose(): void {
  emit("close");
}

const customRenderer = computed(() =>
  resolveFilterRenderer(props.column, props.filterRenderers ?? {}, props.globalFilterRenderer));

const customParams = computed((): FilterRendererParams => ({
  column: props.column,
  columnId: colId.value,
  currentFilter: props.currentFilter,
  distinctValues: props.distinctValues,
  labels: props.labels,
  apply: handleApply,
  close: handleClose,
}));

// Determine filter type based on column data type
const dataType = computed(() => props.column.cellDataType);

const isTextType = computed(() => dataType.value === "text" || dataType.value === "object");

const isNumberType = computed(() => dataType.value === "number");

const isDateType = computed(() =>
  dataType.value === "date" ||
  dataType.value === "dateString" ||
  dataType.value === "dateTime" ||
  dataType.value === "dateTimeString"
);

// Dynamic positioning
let rafId: number | null = null;

const updatePosition = (): void => {
  const container = props.containerRef;
  const popup = popupRef.value;
  if (!container || !popup) return;

  const headerCell = container.querySelector(
    `[data-col-index="${props.colIndex}"]`,
  ) as HTMLElement | null;
  if (!headerCell) return;

  const pos = calculateFilterPopupPosition(headerCell, popup);
  popupTop.value = pos.top;
  popupLeft.value = pos.left;
  popupMinWidth.value = pos.minWidth;
  isPositioned.value = true;
};

const handleScrollOrResize = (): void => {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    updatePosition();
  });
};

// Reposition whenever colIndex changes (e.g., user clicks another column's
// filter icon while a popup is open). flush: 'post' runs after Vue commits the
// DOM, within the same tick — the new position lands before the browser paints,
// so the popup doesn't briefly appear at the previous column's anchor.
watchEffect(() => {
  // Read reactive deps so this effect re-runs when they change.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  props.colIndex;
  updatePosition();
}, { flush: 'post' });

onMounted(() => {
  // Scroll events don't bubble, so listen in the capture phase on window to
  // catch scrolls from the grid body, the page, and any wrapping scroll
  // container in the host app.
  window.addEventListener("scroll", handleScrollOrResize, { passive: true, capture: true });
  window.addEventListener("resize", handleScrollOrResize);
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleScrollOrResize, { capture: true });
  window.removeEventListener("resize", handleScrollOrResize);
  if (rafId !== null) cancelAnimationFrame(rafId);
});

// Position popup below the header
const popupStyle = computed(() => ({
  position: "fixed" as const,
  top: `${popupTop.value}px`,
  left: `${popupLeft.value}px`,
  minWidth: `${popupMinWidth.value}px`,
  zIndex: 10000,
  visibility: isPositioned.value ? ("visible" as const) : ("hidden" as const),
}));
</script>

<template>
  <div ref="popupRef" class="gp-grid-filter-popup" :style="popupStyle">
    <div class="gp-grid-filter-header">
      {{ formatLabel(labels.filterTitle, { column: column.headerName ?? column.field }) }}
    </div>

    <CustomFilterContent
      v-if="customRenderer"
      :key="colId"
      :renderer="customRenderer"
      :params="customParams"
    />

    <!-- Number filter -->
    <NumberFilterContent
      v-else-if="isNumberType"
      :current-filter="currentFilter"
      :labels="labels"
      @apply="handleApply"
      @close="handleClose"
    />

    <!-- Date filter -->
    <DateFilterContent
      v-else-if="isDateType"
      :current-filter="currentFilter"
      :labels="labels"
      @apply="handleApply"
      @close="handleClose"
    />

    <!-- Text filter (default) -->
    <TextFilterContent
      v-else
      :distinct-values="distinctValues"
      :value-formatter="column.valueFormatter"
      :current-filter="currentFilter"
      :labels="labels"
      @apply="handleApply"
      @close="handleClose"
    />
  </div>
</template>
