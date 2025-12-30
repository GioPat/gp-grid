// packages/vue/src/components/FilterPopup.ts

import { defineComponent, ref, onMounted, onUnmounted, h, type PropType } from "vue";
import type { ColumnDefinition, CellValue, ColumnFilterModel } from "gp-grid-core";
import { TextFilterContent } from "./TextFilterContent";
import { NumberFilterContent } from "./NumberFilterContent";
import { DateFilterContent } from "./DateFilterContent";

export const FilterPopup = defineComponent({
  name: "FilterPopup",

  props: {
    column: {
      type: Object as PropType<ColumnDefinition>,
      required: true,
    },
    colIndex: {
      type: Number,
      required: true,
    },
    anchorRect: {
      type: Object as PropType<{ top: number; left: number; width: number; height: number }>,
      required: true,
    },
    distinctValues: {
      type: Array as PropType<CellValue[]>,
      required: true,
    },
    currentFilter: {
      type: Object as PropType<ColumnFilterModel>,
      default: undefined,
    },
  },

  emits: ["apply", "close"],

  setup(props, { emit }) {
    const popupRef = ref<HTMLDivElement | null>(null);

    const handleApply = (colId: string, filter: ColumnFilterModel | null): void => {
      emit("apply", colId, filter);
      emit("close");
    };

    const handleClose = (): void => {
      emit("close");
    };

    // Close on click outside
    onMounted(() => {
      const handleClickOutside = (e: MouseEvent): void => {
        const target = e.target as HTMLElement;
        // Ignore clicks on filter icons
        if (target.closest(".gp-grid-filter-icon")) {
          return;
        }
        if (popupRef.value && !popupRef.value.contains(target)) {
          handleClose();
        }
      };

      const handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === "Escape") {
          handleClose();
        }
      };

      // Add listeners after a frame to avoid immediate close
      requestAnimationFrame(() => {
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
      });

      onUnmounted(() => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      });
    });

    return {
      popupRef,
      handleApply,
      handleClose,
    };
  },

  render() {
    const { column, anchorRect, distinctValues, currentFilter } = this.$props;
    const { popupRef, handleApply, handleClose } = this;

    // Position popup below the header
    const popupStyle = {
      position: "fixed" as const,
      top: `${anchorRect.top + anchorRect.height + 4}px`,
      left: `${anchorRect.left}px`,
      minWidth: `${Math.max(200, anchorRect.width)}px`,
      zIndex: 10000,
    };

    // Determine filter type based on column data type
    const dataType = column.cellDataType;
    const isTextType = dataType === "text" || dataType === "object";
    const isNumberType = dataType === "number";
    const isDateType =
      dataType === "date" ||
      dataType === "dateString" ||
      dataType === "dateTime" ||
      dataType === "dateTimeString";

    const colId = column.colId ?? column.field;

    let filterContent;
    if (isNumberType) {
      filterContent = h(NumberFilterContent, {
        currentFilter,
        onApply: (filter: ColumnFilterModel | null) => handleApply(colId, filter),
        onClose: handleClose,
      });
    } else if (isDateType) {
      filterContent = h(DateFilterContent, {
        currentFilter,
        onApply: (filter: ColumnFilterModel | null) => handleApply(colId, filter),
        onClose: handleClose,
      });
    } else {
      // Default to text filter (text, object, or unknown types)
      filterContent = h(TextFilterContent, {
        distinctValues,
        currentFilter,
        onApply: (filter: ColumnFilterModel | null) => handleApply(colId, filter),
        onClose: handleClose,
      });
    }

    return h(
      "div",
      {
        ref: "popupRef",
        class: "gp-grid-filter-popup",
        style: popupStyle,
      },
      [
        h("div", { class: "gp-grid-filter-header" }, `Filter: ${column.headerName ?? column.field}`),
        filterContent,
      ],
    );
  },
});

export default FilterPopup;
