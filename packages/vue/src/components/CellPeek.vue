<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import type {
  CellPosition,
  CellValue,
  ColumnDefinition,
  GridCore,
} from "@gp-grid/core";
import { bindPeekSelectAll, fixedLeftForInline } from "@gp-grid/core";
import { renderCell } from "../renderers/cellRenderer";
import type { Row, VueCellRenderer } from "../types";

const props = defineProps<{
  peekCell: CellPosition;
  column: ColumnDefinition;
  /** Source record, or `undefined` for a record-less (columnar) row. */
  rowData: Row | undefined;
  /** Bound core, used to read raw values without materializing a record. */
  core: GridCore | null;
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
const clipPath = ref("inset(0)");
const positioned = ref(false);

let rafId: number | null = null;

// The portal is position:fixed, so the cell's viewport-space bounds are
// offset by the body client area's screen origin.
const updatePosition = (): void => {
  const container = props.containerRef;
  const overlay = overlayRef.value;
  if (!container || !overlay) return;

  const bounds = props.core?.geometry.getCellBounds(
    props.peekCell.row,
    props.peekCell.col,
    "viewport",
  );
  if (bounds === undefined) {
    emit("close");
    return;
  }

  // Keep the cell's layout width so its content does not reflow, then clip
  // the portion covered by either pin region.
  const clip = props.core?.geometry.getColumnClip(props.peekCell.col);
  if (clip !== undefined && (bounds.left >= clip.end || bounds.left + bounds.width <= clip.start)) {
    emit("close");
    return;
  }
  const inlineStart = clip === undefined ? bounds.left : Math.max(bounds.left, clip.start);
  const inlineEnd = clip === undefined
    ? bounds.left + bounds.width
    : Math.min(bounds.left + bounds.width, clip.end);
  const clippedWidth = inlineEnd - inlineStart;
  const fullLeft = fixedLeftForInline(container, bounds.left, bounds.width);
  const clippedLeft = fixedLeftForInline(container, inlineStart, clippedWidth);
  const leftInset = Math.max(0, clippedLeft - fullLeft);
  const rightInset = Math.max(0, fullLeft + bounds.width - clippedLeft - clippedWidth);

  const origin = container.getBoundingClientRect();
  top.value = origin.top + bounds.top;
  left.value = fullLeft;
  width.value = bounds.width;
  clipPath.value = `inset(0 ${rightInset}px 0 ${leftInset}px)`;
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
  () => [props.peekCell.row, props.peekCell.col, props.core?.geometry.revision ?? 0],
  () => updatePosition(),
  { flush: "post" },
);

const overlayStyle = computed(() => ({
  position: "fixed" as const,
  top: `${top.value}px`,
  left: `${left.value}px`,
  width: `${width.value}px`,
  clipPath: clipPath.value,
  visibility: positioned.value ? ("visible" as const) : ("hidden" as const),
}));

const peekVNode = computed(() => {
  const core = props.core;
  const getValue = (field: string): CellValue =>
    core?.cells.getFieldValue(props.peekCell.row, field) ?? null;

  return renderCell({
    column: props.column,
    rowData: props.rowData,
    rawValue: core?.cells.getValue(props.peekCell.row, props.peekCell.col) ?? null,
    rowId: core?.rows.getId(props.peekCell.row),
    getValue,
    rowIndex: props.peekCell.row,
    colIndex: props.peekCell.col,
    isActive: true,
    isSelected: false,
    isEditing: false,
    cellRenderers: props.cellRenderers,
    globalCellRenderer: props.globalCellRenderer,
  });
});
</script>

<template>
  <div ref="overlayRef" class="gp-grid-cell-peek" :style="overlayStyle">
    <component :is="peekVNode" />
  </div>
</template>
