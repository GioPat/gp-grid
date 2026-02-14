// packages/react/src/components/ColumnMenu.tsx

import React, { useEffect, useRef } from "react";
import type { PinPosition } from "@gp-grid/core";

export interface ColumnMenuProps {
  colIndex: number;
  anchorRect: { x: number; y: number; width: number; height: number };
  currentPinned?: PinPosition;
  onPinLeft: () => void;
  onPinRight: () => void;
  onUnpin: () => void;
  onClose: () => void;
}

export const ColumnMenu: React.FC<ColumnMenuProps> = ({
  anchorRect,
  currentPinned,
  onPinLeft,
  onPinRight,
  onUnpin,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Close on Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="gp-grid-column-menu"
      style={{
        position: "fixed",
        top: `${anchorRect.y + anchorRect.height}px`,
        left: `${anchorRect.x}px`,
        minWidth: "120px",
        backgroundColor: "var(--gp-grid-bg, #ffffff)",
        border: "1px solid var(--gp-grid-border, #dee2e6)",
        borderRadius: "4px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
        zIndex: 1000,
        padding: "4px 0",
      }}
    >
      {currentPinned !== "left" && (
        <button
          className="gp-grid-column-menu-item"
          onClick={() => {
            onPinLeft();
            onClose();
          }}
          style={{
            display: "block",
            width: "100%",
            padding: "8px 12px",
            textAlign: "left",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            color: "var(--gp-grid-text, #212529)",
          }}
        >
          Pin Left
        </button>
      )}
      {currentPinned !== "right" && (
        <button
          className="gp-grid-column-menu-item"
          onClick={() => {
            onPinRight();
            onClose();
          }}
          style={{
            display: "block",
            width: "100%",
            padding: "8px 12px",
            textAlign: "left",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            color: "var(--gp-grid-text, #212529)",
          }}
        >
          Pin Right
        </button>
      )}
      {currentPinned && (
        <button
          className="gp-grid-column-menu-item"
          onClick={() => {
            onUnpin();
            onClose();
          }}
          style={{
            display: "block",
            width: "100%",
            padding: "8px 12px",
            textAlign: "left",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            color: "var(--gp-grid-text, #212529)",
          }}
        >
          Unpin
        </button>
      )}
    </div>
  );
};
