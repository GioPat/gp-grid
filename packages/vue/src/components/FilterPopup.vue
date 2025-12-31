<script setup lang="ts">
import { ref, computed } from "vue";
import type { ColumnDefinition, CellValue, ColumnFilterModel } from "gp-grid-core";
import { useFilterPopup } from "../composables/useFilterPopup";
import TextFilterContent from "./TextFilterContent.vue";
import NumberFilterContent from "./NumberFilterContent.vue";
import DateFilterContent from "./DateFilterContent.vue";

const props = defineProps<{
  column: ColumnDefinition;
  colIndex: number;
  anchorRect: { top: number; left: number; width: number; height: number };
  distinctValues: CellValue[];
  currentFilter?: ColumnFilterModel;
}>();

const emit = defineEmits<{
  apply: [colId: string, filter: ColumnFilterModel | null];
  close: [];
}>();

const popupRef = ref<HTMLDivElement | null>(null);

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

// Position popup below the header
const popupStyle = computed(() => ({
  position: "fixed" as const,
  top: `${props.anchorRect.top + props.anchorRect.height + 4}px`,
  left: `${props.anchorRect.left}px`,
  minWidth: `${Math.max(200, props.anchorRect.width)}px`,
  zIndex: 10000,
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
      :current-filter="currentFilter"
      @apply="handleApply"
      @close="handleClose"
    />
  </div>
</template>
