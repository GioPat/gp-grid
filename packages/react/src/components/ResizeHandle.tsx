// packages/react/src/components/ResizeHandle.tsx

import React from "react";
import type { ResizeTarget } from "@gp-grid/core";

/** Input routes of the edge handles, provided by `useInputHandler`. */
export interface ResizeHandleActions {
  onColumnPointerDown: (colIndex: number, width: number, e: React.PointerEvent) => void;
  onRowPointerDown: (rowIndex: number, height: number, e: React.PointerEvent) => void;
  onDoubleClick: (target: ResizeTarget) => void;
}

export interface ResizeHandleProps {
  axis: ResizeTarget["axis"];
  /** Layout index of a column, or view index of a row. */
  index: number;
  /** Displayed width or height a drag starts from, in px. */
  size: number;
  /** The handle's target is being dragged. */
  active?: boolean;
  actions: ResizeHandleActions;
}

const AXIS_CLASS = {
  column: "gp-grid-header-resize-handle",
  row: "gp-grid-row-resize-handle",
} as const;

const toTarget = (axis: ResizeTarget["axis"], index: number): ResizeTarget =>
  axis === "column" ? { axis, colIndex: index } : { axis, rowIndex: index };

/**
 * Pointer-only edge target: a drag resizes, a double-click fits, and neither
 * reaches the cell underneath. The grid keys are its keyboard equivalent.
 */
export const ResizeHandle = (props: ResizeHandleProps): React.ReactNode => {
  const { axis, index, size, active = false, actions } = props;
  const className = AXIS_CLASS[axis];

  const handlePointerDown = (e: React.PointerEvent): void => {
    e.stopPropagation();
    if (axis === "column") actions.onColumnPointerDown(index, size, e);
    else actions.onRowPointerDown(index, size, e);
  };

  const handleDoubleClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    actions.onDoubleClick(toTarget(axis, index));
  };

  return (
    <div
      className={active ? `${className} ${className}--active` : className}
      aria-hidden="true"
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
    />
  );
};
