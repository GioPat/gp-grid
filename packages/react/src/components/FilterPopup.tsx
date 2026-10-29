// packages/react/src/components/FilterPopup.tsx

import React, { useEffect, useLayoutEffect, useRef, useCallback, useState } from "react";
import type {
  CellValue,
  ColumnDefinition,
  ColumnFilterModel,
  FilterRendererParams,
  GridLabels,
} from "@gp-grid/core";
import { calculateFilterPopupPosition, formatLabel } from "@gp-grid/core";
import { TextFilterContent } from "./TextFilterContent";
import { NumberFilterContent } from "./NumberFilterContent";
import { DateFilterContent } from "./DateFilterContent";
import { resolveFilterRenderer } from "../renderers/filterRenderer";
import type { ReactFilterRenderer } from "../types";

export interface FilterPopupProps {
  column: ColumnDefinition;
  colIndex: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  distinctValues: CellValue[];
  currentFilter?: ColumnFilterModel;
  labels: GridLabels;
  filterRenderers?: Record<string, ReactFilterRenderer>;
  globalFilterRenderer?: ReactFilterRenderer;
  onApply: (colId: string, filter: ColumnFilterModel | null) => void;
  onClose: () => void;
}

export function FilterPopup({
  column,
  colIndex,
  containerRef,
  distinctValues,
  currentFilter,
  labels,
  filterRenderers = {},
  globalFilterRenderer,
  onApply,
  onClose,
}: FilterPopupProps): React.ReactNode {
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({
    position: "fixed",
    zIndex: 10000,
    visibility: "hidden",
  });

  const updatePosition = useCallback((): void => {
    const container = containerRef.current;
    const popup = popupRef.current;
    if (!container || !popup) return;

    const headerCell = container.querySelector(
      `[data-col-index="${colIndex}"]`,
    ) as HTMLElement | null;
    if (!headerCell) return;

    const pos = calculateFilterPopupPosition(headerCell, popup);
    setPopupStyle({
      position: "fixed",
      top: pos.top,
      left: pos.left,
      minWidth: pos.minWidth,
      zIndex: 10000,
      visibility: "visible",
    });
  }, [containerRef, colIndex]);

  // Position synchronously after commit, before paint, so the popup's first
  // frame is at the new column's anchor — not stuck at the previous column's
  // coordinates from stale popupStyle state.
  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  // Reposition on scroll/resize. Scroll events don't bubble, so listen in the
  // capture phase on window to catch scrolls from the GridBody scroller, the
  // page, and any wrapping scroll container in the host app.
  useEffect(() => {
    let rafId: number | null = null;
    const handleScrollOrResize = (): void => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updatePosition();
      });
    };

    window.addEventListener("scroll", handleScrollOrResize, { passive: true, capture: true });
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, { capture: true });
      window.removeEventListener("resize", handleScrollOrResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [updatePosition]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      // Ignore clicks on filter icons - let them handle their own toggle logic
      if (target.closest(".gp-grid-filter-icon")) {
        return;
      }
      if (popupRef.current && !popupRef.current.contains(target)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    // Add listeners after a frame to avoid immediate close from the click that opened the popup
    requestAnimationFrame(() => {
      document.addEventListener("pointerdown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    });

    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleApply = useCallback(
    (filter: ColumnFilterModel | null) => {
      onApply(column.colId ?? column.field, filter);
      onClose();
    },
    [column, onApply, onClose],
  );

  const columnId = column.colId ?? column.field;
  const customRenderer = resolveFilterRenderer(column, filterRenderers, globalFilterRenderer);

  return (
    <div ref={popupRef} className="gp-grid-filter-popup" style={popupStyle}>
      <div className="gp-grid-filter-header">
        {formatLabel(labels.filterTitle, { column: column.headerName ?? column.field })}
      </div>

      {customRenderer
        ? (
          <CustomFilterContent
            key={columnId}
            renderer={customRenderer}
            params={{
              column,
              columnId,
              currentFilter,
              distinctValues,
              labels,
              apply: handleApply,
              close: onClose,
            }}
          />
        )
        : (
          <BuiltInFilterContent
            column={column}
            distinctValues={distinctValues}
            currentFilter={currentFilter}
            labels={labels}
            onApply={handleApply}
            onClose={onClose}
          />
        )}
    </div>
  );
}

interface BuiltInFilterContentProps {
  column: ColumnDefinition;
  distinctValues: CellValue[];
  currentFilter?: ColumnFilterModel;
  labels: GridLabels;
  onApply: (filter: ColumnFilterModel | null) => void;
  onClose: () => void;
}

const DATE_TYPES = new Set(["date", "dateString", "dateTime", "dateTimeString"]);

const BuiltInFilterContent = ({
  column,
  distinctValues,
  ...shared
}: BuiltInFilterContentProps): React.ReactNode => {
  const dataType = column.cellDataType;
  if (dataType === "number") return <NumberFilterContent {...shared} />;
  if (DATE_TYPES.has(dataType)) return <DateFilterContent {...shared} />;
  return (
    <TextFilterContent
      distinctValues={distinctValues}
      valueFormatter={column.valueFormatter}
      {...shared}
    />
  );
};

/** Mounted as a component so the renderer's hooks belong to it, not to the popup. */
const CustomFilterContent = ({
  renderer,
  params,
}: {
  renderer: ReactFilterRenderer;
  params: FilterRendererParams;
}): React.ReactNode => renderer(params);
