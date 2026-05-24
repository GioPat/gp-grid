// packages/react/src/components/CellPeek.tsx

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  CellPosition,
  ColumnDefinition,
} from "@gp-grid/core";
import { bindPeekSelectAll } from "@gp-grid/core";
import { renderCell } from "../renderers/cellRenderer";
import type { ReactCellRenderer } from "../types";

export interface CellPeekProps<TData = unknown> {
  peekCell: CellPosition;
  column: ColumnDefinition;
  rowData: TData;
  containerRef: React.RefObject<HTMLDivElement | null>;
  cellRenderers: Record<string, ReactCellRenderer>;
  globalCellRenderer?: ReactCellRenderer;
  onClose: () => void;
}

interface PeekStyle {
  top: number;
  left: number;
  width: number;
  visibility: "visible" | "hidden";
}

const HIDDEN_STYLE: PeekStyle = {
  top: 0,
  left: 0,
  width: 0,
  visibility: "hidden",
};

export function CellPeek<TData = unknown>({
  peekCell,
  column,
  rowData,
  containerRef,
  cellRenderers,
  globalCellRenderer,
  onClose,
}: CellPeekProps<TData>): React.ReactNode {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<PeekStyle>(HIDDEN_STYLE);

  const updatePosition = useCallback((): void => {
    const container = containerRef.current;
    const overlay = overlayRef.current;
    if (!container || !overlay) return;

    const cellEl = container.querySelector(
      `[data-cell-row="${peekCell.row}"][data-cell-col="${peekCell.col}"]`,
    ) as HTMLElement | null;
    if (!cellEl) {
      // Cell scrolled out of view — close the peek.
      onClose();
      return;
    }

    const cellRect = cellEl.getBoundingClientRect();
    setStyle({
      top: cellRect.top,
      left: cellRect.left,
      width: cellRect.width,
      visibility: "visible",
    });
  }, [containerRef, peekCell.row, peekCell.col, onClose]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  // Reposition on scroll/resize. Use capture-phase scroll listening so we
  // also catch the GridBody's inner scroller (scroll events don't bubble).
  useEffect(() => {
    let rafId: number | null = null;
    const onScrollOrResize = (): void => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updatePosition();
      });
    };

    window.addEventListener("scroll", onScrollOrResize, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      window.removeEventListener("scroll", onScrollOrResize, { capture: true });
      window.removeEventListener("resize", onScrollOrResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [updatePosition]);

  // Close on outside click. ESC is handled by the grid's keyboard handler
  // (which routes through core.stopPeek), so we don't duplicate it here.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement;
      if (overlayRef.current?.contains(target)) return;
      onClose();
    };

    // Defer one frame so the dblclick that opened the peek doesn't
    // immediately close it via its trailing pointer events.
    const rafId = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", onPointerDown);
    });

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  // Scope Ctrl/Cmd+A to the peek content. Pure CSS can't do this — the
  // shortcut creates a document-wide Selection regardless of user-select,
  // and form controls have their own selection model on top.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    return bindPeekSelectAll(overlay);
  }, []);

  const content = renderCell({
    column,
    rowData,
    rowIndex: peekCell.row,
    colIndex: peekCell.col,
    isActive: true,
    isSelected: false,
    isEditing: false,
    cellRenderers,
    globalCellRenderer,
  });

  return (
    <div
      ref={overlayRef}
      className="gp-grid-cell-peek"
      style={{
        position: "fixed",
        top: style.top,
        left: style.left,
        width: style.width,
        visibility: style.visibility,
      }}
    >
      {content}
    </div>
  );
}
