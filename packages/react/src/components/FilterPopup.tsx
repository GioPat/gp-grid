// packages/react/src/components/FilterPopup.tsx

import React, { useEffect, useRef, useCallback, useState } from "react";
import type { ColumnDefinition, CellValue, ColumnFilterModel } from "@gp-grid/core";
import { calculateFilterPopupPosition } from "@gp-grid/core";
import { TextFilterContent } from "./TextFilterContent";
import { NumberFilterContent } from "./NumberFilterContent";
import { DateFilterContent } from "./DateFilterContent";

export interface FilterPopupProps {
  column: ColumnDefinition;
  colIndex: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  distinctValues: CellValue[];
  currentFilter?: ColumnFilterModel;
  onApply: (colId: string, filter: ColumnFilterModel | null) => void;
  onClose: () => void;
}

export function FilterPopup({
  column,
  colIndex,
  containerRef,
  distinctValues,
  currentFilter,
  onApply,
  onClose,
}: FilterPopupProps): React.ReactNode {
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({
    position: "fixed",
    zIndex: 10000,
    visibility: "hidden",
  });

  // Dynamic positioning: recalculate on scroll/resize
  useEffect(() => {
    const container = containerRef.current;
    const popup = popupRef.current;
    if (!container || !popup) return;

    let rafId: number | null = null;

    const updatePosition = (): void => {
      const headerCell = container.querySelector(
        `[data-col-index="${colIndex}"]`,
      ) as HTMLElement | null;
      if (!headerCell || !popupRef.current) return;

      const pos = calculateFilterPopupPosition(headerCell, popupRef.current);
      setPopupStyle({
        position: "fixed",
        top: pos.top,
        left: pos.left,
        minWidth: pos.minWidth,
        zIndex: 10000,
        visibility: "visible",
      });
    };

    const handleScrollOrResize = (): void => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updatePosition();
      });
    };

    // Initial position (after first render so popup has dimensions)
    requestAnimationFrame(updatePosition);

    // Listen for scroll on the grid container (captures body scroll)
    container.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      container.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [containerRef, colIndex]);

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
      const colId = column.colId ?? column.field;
      onApply(colId, filter);
      onClose();
    },
    [column, onApply, onClose],
  );

  // Determine filter type based on column data type
  const dataType = column.cellDataType;
  const isTextType = dataType === "text" || dataType === "object";
  const isNumberType = dataType === "number";
  const isDateType =
    dataType === "date" ||
    dataType === "dateString" ||
    dataType === "dateTime" ||
    dataType === "dateTimeString";

  return (
    <div ref={popupRef} className="gp-grid-filter-popup" style={popupStyle}>
      <div className="gp-grid-filter-header">
        Filter: {column.headerName ?? column.field}
      </div>

      {isTextType && (
        <TextFilterContent
          distinctValues={distinctValues}
          currentFilter={currentFilter}
          onApply={handleApply}
          onClose={onClose}
        />
      )}

      {isNumberType && (
        <NumberFilterContent
          currentFilter={currentFilter}
          onApply={handleApply}
          onClose={onClose}
        />
      )}

      {isDateType && (
        <DateFilterContent
          currentFilter={currentFilter}
          onApply={handleApply}
          onClose={onClose}
        />
      )}

      {!isTextType && !isNumberType && !isDateType && (
        <TextFilterContent
          distinctValues={distinctValues}
          currentFilter={currentFilter}
          onApply={handleApply}
          onClose={onClose}
        />
      )}
    </div>
  );
}
