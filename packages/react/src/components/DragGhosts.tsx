// packages/react/src/components/DragGhosts.tsx

import React, { useMemo } from "react";
import { readFixedOriginIn } from "@gp-grid/core";
import type { ColumnDefinition, DragState, FixedOrigin } from "@gp-grid/core";

export interface DragGhostsProps {
  dragState: DragState;
  columns: ColumnDefinition[];
  totalHeaderHeight: number;
  totalWidth: number;
  hostRef: React.RefObject<HTMLDivElement | null>;
}

const NO_ORIGIN: FixedOrigin = { top: 0, left: 0 };

/** Column-move and row-drag ghosts, `position: fixed` at the pointer. */
export function DragGhosts({
  dragState,
  columns,
  totalHeaderHeight,
  totalWidth,
  hostRef,
}: DragGhostsProps): React.ReactNode {
  const { dragType, columnMove, rowDrag } = dragState;
  // Read once per drag: the probe forces a layout, too costly on every move.
  const origin = useMemo(() => {
    const host = hostRef.current;
    const hasGhost = dragType === "column-move" || dragType === "row-drag";
    return hasGhost && host ? readFixedOriginIn(host) : NO_ORIGIN;
  }, [dragType, hostRef]);

  if (dragType === "column-move" && columnMove) {
    const column = columns[columnMove.sourceColIndex];
    return (
      <>
        <div
          className="gp-grid-column-move-ghost"
          style={{
            left: columnMove.currentX - columnMove.ghostWidth / 2 - origin.left,
            top: columnMove.currentY - columnMove.ghostHeight / 2 - origin.top,
            width: columnMove.ghostWidth,
            height: columnMove.ghostHeight,
          }}
        >
          {column?.headerName ?? column?.field ?? ""}
        </div>
        {columnMove.dropTargetIndex !== null && (
          <div
            className="gp-grid-column-drop-indicator"
            style={{
              position: "absolute",
              top: 0,
              insetInlineStart: columnMove.dropIndicatorX,
              height: totalHeaderHeight,
            }}
          />
        )}
      </>
    );
  }

  if (dragType === "row-drag" && rowDrag) {
    return (
      <div
        className="gp-grid-row-drag-ghost"
        style={{
          left: rowDrag.currentX + 12 - origin.left,
          top: rowDrag.currentY - rowDrag.sourceRowHeight / 2 - origin.top,
          width: Math.min(300, totalWidth),
          height: rowDrag.sourceRowHeight,
        }}
      />
    );
  }

  return null;
}
