<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import type { CellPosition, ColumnDefinition } from "@gp-grid/core";
import { bindPeekSelectAll } from "@gp-grid/core";
import { renderCell } from "../renderers/cellRenderer";
import type { Row, VueCellRenderer } from "../types";

const props = defineProps<{
  peekCell: CellPosition;
  column: ColumnDefinition;
  rowData: Row;
  containerRef: HTMLDivElement | null;
  cellRenderers: Record<string, VueCellRenderer>;
  globalCellRenderer?: VueCellRenderer;
}>();

const emit = defineEmits<{
  close: [];
}>();

const overlayRef = ref<HTMLDivElement | null>(null);
const top = ref(0);
const left = ref(0);
const width = ref(0);
const positioned = ref(false);

let rafId: number | null = null;

const updatePosition = (): void => {
  const container = props.containerRef;
  const overlay = overlayRef.value;
  if (!container || !overlay) return;

  const cellEl = container.querySelector(
    `[data-cell-row="${props.peekCell.row}"][data-cell-col="${props.peekCell.col}"]`,
  ) as HTMLElement | null;
  if (!cellEl) {
    emit("close");
    return;
  }

  const rect = cellEl.getBoundingClientRect();
  top.value = rect.top;
  left.value = rect.left;
  width.value = rect.width;
  positioned.value = true;
};

const onScrollOrResize = (): void => {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    updatePosition();
  });
};

const onPointerDown = (e: PointerEvent): void => {
  const target = e.target as HTMLElement;
  if (overlayRef.value?.contains(target)) return;
  emit("close");
};


let pointerRafId: number | null = null;
let unbindSelectAll: (() => void) | null = null;

onMounted(() => {
  updatePosition();
  window.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true });
  window.addEventListener("resize", onScrollOrResize);
  if (overlayRef.value) unbindSelectAll = bindPeekSelectAll(overlayRef.value);
  pointerRafId = requestAnimationFrame(() => {
    document.addEventListener("pointerdown", onPointerDown);
  });
});

onUnmounted(() => {
  window.removeEventListener("scroll", onScrollOrResize, { capture: true });
  window.removeEventListener("resize", onScrollOrResize);
  document.removeEventListener("pointerdown", onPointerDown);
  unbindSelectAll?.();
  if (rafId !== null) cancelAnimationFrame(rafId);
  if (pointerRafId !== null) cancelAnimationFrame(pointerRafId);
});

watch(
  () => [props.peekCell.row, props.peekCell.col],
  () => updatePosition(),
  { flush: "post" },
);

const overlayStyle = computed(() => ({
  position: "fixed" as const,
  top: `${top.value}px`,
  left: `${left.value}px`,
  width: `${width.value}px`,
  visibility: positioned.value ? ("visible" as const) : ("hidden" as const),
}));

const peekVNode = computed(() =>
  renderCell({
    column: props.column,
    rowData: props.rowData,
    rowIndex: props.peekCell.row,
    colIndex: props.peekCell.col,
    isActive: true,
    isSelected: false,
    isEditing: false,
    cellRenderers: props.cellRenderers,
    globalCellRenderer: props.globalCellRenderer,
  }),
);
</script>

<template>
  <div ref="overlayRef" class="gp-grid-cell-peek" :style="overlayStyle">
    <component :is="peekVNode" />
  </div>
</template>
