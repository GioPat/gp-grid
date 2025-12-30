// packages/core/src/styles/cells.ts
// Data cell styles including selection, active, editing, and fill handle

export const cellStyles = `
/* =============================================================================
   Data Cells
   ============================================================================= */

.gp-grid-row {
  position: absolute;
  top: 0;
  left: 0;
}

.gp-grid-cell {
  position: absolute;
  top: 0;
  box-sizing: border-box;
  padding: 0 12px;
  display: flex;
  align-items: center;
  cursor: cell;
  color: var(--gp-grid-text);
  border-right: 1px solid var(--gp-grid-border-light);
  border-bottom: 1px solid var(--gp-grid-border-light);
  background-color: var(--gp-grid-bg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
}

/* Alternating row colors */
.gp-grid-row--even .gp-grid-cell {
  background-color: var(--gp-grid-bg-alt);
}

.gp-grid-cell:hover {
  background-color: var(--gp-grid-hover) !important;
}

/* Active cell (focused) */
.gp-grid-cell--active {
  background-color: var(--gp-grid-primary-light) !important;
  border: 2px solid var(--gp-grid-primary) !important;
  outline: none;
  z-index: 5;
  padding: 0 11px;
}

/* Selected cells (range selection) */
.gp-grid-cell--selected {
  background-color: var(--gp-grid-primary-light) !important;
}

/* Editing cell */
.gp-grid-cell--editing {
  background-color: var(--gp-grid-bg) !important;
  border: 2px solid var(--gp-grid-primary) !important;
  padding: 0 !important;
  z-index: 10;
}

/* =============================================================================
   Fill Handle (drag to fill)
   ============================================================================= */

.gp-grid-fill-handle {
  position: absolute;
  width: 8px;
  height: 8px;
  background-color: var(--gp-grid-primary);
  border: 2px solid var(--gp-grid-bg);
  cursor: crosshair;
  z-index: 100;
  pointer-events: auto;
  box-sizing: border-box;
  border-radius: 1px;
}

.gp-grid-fill-handle:hover {
  transform: scale(1.2);
}

/* Fill preview (cells being filled) */
.gp-grid-cell--fill-preview {
  background-color: var(--gp-grid-primary-light) !important;
  border: 1px dashed var(--gp-grid-primary) !important;
}

/* =============================================================================
   Edit Input
   ============================================================================= */

.gp-grid-edit-input {
  width: 100%;
  height: 100%;
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
`;
