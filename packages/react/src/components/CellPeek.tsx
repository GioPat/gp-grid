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
  CellValue,
  ColumnDefinition,
  GridCore,
  RowId,
} from "@gp-grid/core";
import { bindPeekSelectAll } from "@gp-grid/core";
import { renderCell } from "../renderers/cellRenderer";
import type { ReactCellRenderer } from "../types";

export interface CellPeekProps<TData = unknown> {
  peekCell: CellPosition;
  column: ColumnDefinition;
  /** Source record, or `undefined` for a record-less (columnar) row. */
  rowData: TData | undefined;
  /** Raw value read through the core read path. */
  rawValue?: CellValue;
  /** Stable identity for the row, when the source exposes one. */
  rowId?: RowId;
  /** Read another field's raw value at this row without a record. */
  getValue?: (field: string) => CellValue;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Bound core; peek anchoring is a geometry query, not a DOM measurement. */
  core: GridCore<TData> | null;
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
  rawValue,
  rowId,
  getValue,
  containerRef,
  core,
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

    // The portal is position:fixed; the cell's viewport-space bounds are
    // offset by the body client area's screen origin.
    const bounds = core?.geometry.getCellBounds(peekCell.row, peekCell.col, "viewport");
    if (bounds === undefined) {
      onClose();
      return;
    }

    const origin = container.getBoundingClientRect();
    setStyle({
      top: origin.top + bounds.top,
      left: origin.left + bounds.left,
      width: bounds.width,
      visibility: "visible",
    });
  }, [containerRef, core, peekCell.row, peekCell.col, onClose]);

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
    rawValue,
    rowId,
    getValue,
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
