// packages/core/src/styles/row-drag.ts

export const rowDragStyles: string = `
/* =============================================================================
   Row Drag
   ============================================================================= */

.gp-grid-cell--row-drag-handle {
  cursor: grab;
}

.gp-grid-cell--row-drag-handle:active {
  cursor: grabbing;
}

.gp-grid-row-drag-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--gp-grid-text-secondary);
}

.gp-grid-row-drag-icon svg {
  width: 16px;
  height: 16px;
}

.gp-grid-row-drag-ghost {
  position: fixed;
  pointer-events: none;
  opacity: 0.8;
  z-index: 2000;
  background-color: var(--gp-grid-bg, #fff);
  border: 2px solid var(--gp-grid-primary);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  box-sizing: border-box;
}

.gp-grid-row-drop-indicator {
  position: absolute;
  left: 0;
  width: 100%;
  height: 3px;
  background-color: var(--gp-grid-primary);
  z-index: 1000;
  pointer-events: none;
  border-radius: 2px;
}
`;
