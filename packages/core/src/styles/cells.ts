// packages/core/src/styles/cells.ts

// Data cell styles including selection, active, editing, and fill handle
export const cellStyles: string = `
/* =============================================================================
   Data Cells
   ============================================================================= */

/* Rows wrapper - positions rows with small translateY values for large datasets */
.gp-grid-rows-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  /* Keep wrapper below the sticky header (z-index: 10) */
  z-index: 1;
  will-change: transform; 
}

.gp-grid-row {
  position: absolute;
  top: 0;
  left: 0;
}

/* Row background - :where() for zero specificity, so user highlight classes always win */
:where(.gp-grid-row) {
  background-color: var(--gp-grid-bg);
}

/* Structural properties - required for grid layout */
.gp-grid-cell {
  position: absolute;
  top: 0;
  box-sizing: border-box;
  display: flex;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
}

/* Visual properties - :where() for zero specificity, so user highlight classes always win */
:where(.gp-grid-cell) {
  align-items: center;
  padding: 0 12px;
  cursor: cell;
  color: var(--gp-grid-text);
  border-right: 1px solid var(--gp-grid-border-light);
  border-bottom: 1px solid var(--gp-grid-border-light);
  background-color: transparent;
}

/* Active cell (focused) - structural properties stay, visual use :where() */
.gp-grid-cell--active {
  outline: none;
  z-index: 5;
}
:where(.gp-grid-cell--active) {
  background-color: var(--gp-grid-primary-light);
  border: 2px solid var(--gp-grid-primary);
  padding: 0 11px;
}

/* Selected cells (range selection) */
:where(.gp-grid-cell--selected) {
  background-color: var(--gp-grid-primary-light);
}

/* Editing cell - structural properties stay, visual use :where() */
.gp-grid-cell--editing {
  z-index: 10;
}
:where(.gp-grid-cell--editing) {
  background-color: var(--gp-grid-bg);
  border: 2px solid var(--gp-grid-primary);
  padding: 0;
}

/* =============================================================================
   Fill Handle (drag to fill)
   ============================================================================= */

.gp-grid-fill-handle {
  position: absolute;
  width: 8px;
  height: 8px;
  z-index: 11;
  pointer-events: auto;
  box-sizing: border-box;
  touch-action: none;
}

:where(.gp-grid-fill-handle) {
  background-color: var(--gp-grid-primary);
  border: 2px solid var(--gp-grid-bg);
  cursor: crosshair;
  border-radius: 1px;
}

:where(.gp-grid-fill-handle:hover) {
  transform: scale(1.2);
}

@media (pointer: coarse) and (hover: none) and (max-width: 768px) {
  .gp-grid-fill-handle {
    width: 24px;
    height: 24px;
  }
  :where(.gp-grid-fill-handle) {
    border-width: 3px;
    border-radius: 3px;
  }
}

/* Fill preview (cells being filled) */
:where(.gp-grid-cell.gp-grid-cell--fill-preview) {
  background-color: var(--gp-grid-primary-light);
  border: 1px dashed var(--gp-grid-primary);
}

/* =============================================================================
   Edit Input
   ============================================================================= */

.gp-grid-edit-input {
  width: 100%;
  height: 100%;
}

:where(.gp-grid-edit-input) {
  padding: 0 11px;
  font-family: inherit;
  font-size: inherit;
  color: var(--gp-grid-text);
  border: none;
  background-color: transparent;
}

.gp-grid-edit-input:focus {
  outline: none;
}

/* =============================================================================
   Cell Peek (read-only multi-line overlay on dblclick of non-editable cell)
   ============================================================================= */

/* Structural: positioned absolutely by the framework wrapper; must sit above
   selection (z:5), editing (z:10), fill handle (z:11). */
.gp-grid-cell-peek {
  position: absolute;
  z-index: 20;
  box-sizing: border-box;
  overflow: auto;
  max-height: 320px;
}

:where(.gp-grid-cell-peek) {
  padding: 8px 11px;
  background-color: var(--gp-grid-bg);
  color: var(--gp-grid-text);
  border: 2px solid var(--gp-grid-primary);
  border-radius: 3px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-family: inherit;
  font-size: inherit;
  line-height: 1.4;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}

`;
