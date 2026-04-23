<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import type { ColumnDefinition, CellValue, ColumnFilterModel } from "@gp-grid/core";
import { calculateFilterPopupPosition } from "@gp-grid/core";
import { useFilterPopup } from "../composables/useFilterPopup";
import TextFilterContent from "./TextFilterContent.vue";
import NumberFilterContent from "./NumberFilterContent.vue";
import DateFilterContent from "./DateFilterContent.vue";

const props = defineProps<{
  column: ColumnDefinition;
  colIndex: number;
  containerRef: HTMLDivElement | null;
  distinctValues: CellValue[];
  currentFilter?: ColumnFilterModel;
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

onMounted(() => {
  // Initial position after first render
  requestAnimationFrame(updatePosition);

  const container = props.containerRef;
  if (container) {
    container.addEventListener("scroll", handleScrollOrResize, { passive: true });
  }
  window.addEventListener("resize", handleScrollOrResize);
});

onUnmounted(() => {
  const container = props.containerRef;
  if (container) {
    container.removeEventListener("scroll", handleScrollOrResize);
  }
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
      Filter: {{ column.headerName ?? column.field }}
    </div>

    <!-- Number filter -->
    <NumberFilterContent
      v-if="isNumberType"
      :current-filter="currentFilter"
      @apply="handleApply"
      @close="handleClose"
    />

    <!-- Date filter -->
    <DateFilterContent
      v-else-if="isDateType"
      :current-filter="currentFilter"
      @apply="handleApply"
      @close="handleClose"
    />

    <!-- Text filter (default) -->
    <TextFilterContent
      v-else
      :distinct-values="distinctValues"
      :value-formatter="column.valueFormatter"
      :current-filter="currentFilter"
      @apply="handleApply"
      @close="handleClose"
    />
  </div>
</template>
