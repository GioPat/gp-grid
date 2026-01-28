// packages/react/src/components/FilterPopup.tsx

import React, { useEffect, useRef, useCallback } from "react";
import type { ColumnDefinition, CellValue, ColumnFilterModel } from "@gp-grid/core";
import { TextFilterContent } from "./TextFilterContent";
import { NumberFilterContent } from "./NumberFilterContent";
import { DateFilterContent } from "./DateFilterContent";

export interface FilterPopupProps {
  column: ColumnDefinition;
  colIndex: number;
  anchorRect: { top: number; left: number; width: number; height: number };
  distinctValues: CellValue[];
  currentFilter?: ColumnFilterModel;
  onApply: (colId: string, filter: ColumnFilterModel | null) => void;
  onClose: () => void;
}

export function FilterPopup({
  column,
  colIndex,
  anchorRect,
  distinctValues,
  currentFilter,
  onApply,
  onClose,
}: FilterPopupProps): React.ReactNode {
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
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
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    });

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
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

  // Position popup below the header
  const popupStyle: React.CSSProperties = {
    position: "fixed",
    top: anchorRect.top + anchorRect.height + 4,
    left: anchorRect.left,
    minWidth: Math.max(200, anchorRect.width),
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
