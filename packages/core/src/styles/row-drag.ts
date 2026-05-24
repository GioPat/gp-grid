// packages/core/src/styles/row-drag.ts

export const rowDragStyles: string = `
/* =============================================================================
   Row Drag
   ============================================================================= */

.gp-grid-cell--row-drag-handle {
  touch-action: none;
}

:where(.gp-grid-cell--row-drag-handle) {
  cursor: grab;
}

:where(.gp-grid-cell--row-drag-handle:active) {
  cursor: grabbing;
}

.gp-grid-row-drag-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

:where(.gp-grid-row-drag-icon) {
  color: var(--gp-grid-text-secondary);
}

.gp-grid-row-drag-icon svg {
  width: 16px;
  height: 16px;
}

.gp-grid-row-drag-ghost {
  position: fixed;
  pointer-events: none;
  z-index: 2000;
  overflow: hidden;
  box-sizing: border-box;
}

:where(.gp-grid-row-drag-ghost) {
  opacity: 0.8;
  background-color: var(--gp-grid-bg, #fff);
  border: 2px solid var(--gp-grid-primary);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.gp-grid-row-drop-indicator {
  position: absolute;
  left: 0;
  width: 100%;
  height: 3px;
  z-index: 1000;
  pointer-events: none;
}

:where(.gp-grid-row-drop-indicator) {
  background-color: var(--gp-grid-primary);
  border-radius: 2px;
}
`;
