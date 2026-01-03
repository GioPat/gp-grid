// packages/core/src/styles/header.ts

// Header row, cell, sort arrows, and filter icon styles
export const headerStyles: string = `
/* =============================================================================
   Header
   ============================================================================= */

.gp-grid-header {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 100;
  background-color: var(--gp-grid-header-bg);
  border-bottom: 1px solid var(--gp-grid-border);
}

.gp-grid-container .gp-grid-header-cell {
  position: absolute;
  box-sizing: border-box;
  border-right: 1px solid var(--gp-grid-border);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--gp-grid-header-text);
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  padding: 0 12px;
  background-color: transparent;
  transition: background-color 0.1s ease;
}

.gp-grid-container .gp-grid-header-cell:hover {
  background-color: var(--gp-grid-hover);
}

.gp-grid-container .gp-grid-header-cell:active {
  background-color: var(--gp-grid-border-light);
}

.gp-grid-container .gp-grid-header-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--gp-grid-header-text);
}

/* Header icons container */
.gp-grid-header-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

/* Stacked sort arrows */
.gp-grid-sort-arrows {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
}

.gp-grid-sort-arrows-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.gp-grid-sort-arrow-up,
.gp-grid-sort-arrow-down {
  opacity: 0.35;
  transition: opacity 0.15s ease, color 0.15s ease;
  color: var(--gp-grid-text);
}

.gp-grid-sort-arrow-up.active,
.gp-grid-sort-arrow-down.active {
  opacity: 1;
  color: var(--gp-grid-primary);
}

.gp-grid-sort-index {
  font-size: 9px;
  color: var(--gp-grid-primary);
  font-weight: 600;
}

/* Filter icon */
.gp-grid-filter-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--gp-grid-text-secondary);
  transition: background-color 0.15s ease, color 0.15s ease;
  margin-left: 2px;
}

.gp-grid-filter-icon:hover {
  background-color: var(--gp-grid-hover);
  color: var(--gp-grid-primary);
}

.gp-grid-filter-icon.active {
  color: var(--gp-grid-primary);
  background-color: var(--gp-grid-primary-light);
}
`;
