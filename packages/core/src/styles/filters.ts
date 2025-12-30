// packages/core/src/styles/filters.ts
// Filter popup and filter-related styles

export const filtersStyles = `
/* =============================================================================
   Filter Popup
   ============================================================================= */

.gp-grid-filter-popup {
  background-color: var(--gp-grid-bg);
  border: 1px solid var(--gp-grid-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-height: 400px;
  display: flex;
  flex-direction: column;
  font-size: 13px;
}

.gp-grid-filter-header {
  padding: 10px 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--gp-grid-border-light);
  color: var(--gp-grid-header-text);
}

.gp-grid-filter-content {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

/* Mode toggle (Values / Condition) */
.gp-grid-filter-mode-toggle {
  display: flex;
  gap: 4px;
  background-color: var(--gp-grid-bg-alt);
  border-radius: 4px;
  padding: 2px;
}

.gp-grid-filter-mode-toggle button {
  flex: 1;
  padding: 6px 10px;
  font-size: 11px;
  font-family: inherit;
  border: none;
  border-radius: 3px;
  background-color: transparent;
  color: var(--gp-grid-text-secondary);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.gp-grid-filter-mode-toggle button:hover {
  color: var(--gp-grid-text);
}

.gp-grid-filter-mode-toggle button.active {
  background-color: var(--gp-grid-bg);
  color: var(--gp-grid-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* Info message for too many values */
.gp-grid-filter-info {
  font-size: 11px;
  color: var(--gp-grid-text-secondary);
  padding: 6px 8px;
  background-color: var(--gp-grid-bg-alt);
  border-radius: 4px;
}

/* Search input in filter */
.gp-grid-filter-search {
  width: 100%;
  height: 30px;
  padding: 0 10px;
  font-family: inherit;
  font-size: 12px;
  border: 1px solid var(--gp-grid-input-border);
  border-radius: 4px;
  background-color: var(--gp-grid-input-bg);
  color: var(--gp-grid-text);
  box-sizing: border-box;
}

.gp-grid-filter-search:focus {
  outline: none;
  border-color: var(--gp-grid-primary);
}

/* Select All / Deselect All actions */
.gp-grid-filter-actions {
  display: flex;
  gap: 8px;
}

.gp-grid-filter-actions button {
  flex: 1;
  padding: 4px 8px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--gp-grid-input-border);
  border-radius: 3px;
  background-color: var(--gp-grid-bg);
  color: var(--gp-grid-text);
  cursor: pointer;
}

.gp-grid-filter-actions button:hover:not(:disabled) {
  background-color: var(--gp-grid-hover);
}

.gp-grid-filter-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Checkbox list */
.gp-grid-filter-list {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--gp-grid-border-light);
  border-radius: 4px;
  padding: 6px;
}

.gp-grid-filter-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 3px;
  cursor: pointer;
}

.gp-grid-filter-option:hover {
  background-color: var(--gp-grid-hover);
}

.gp-grid-filter-option input[type="checkbox"] {
  margin: 0;
  cursor: pointer;
}

.gp-grid-filter-option span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gp-grid-filter-blank {
  font-style: italic;
  color: var(--gp-grid-text-muted);
}

/* Filter condition row (for number/date filters) */
.gp-grid-filter-condition {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gp-grid-filter-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.gp-grid-filter-row select {
  height: 30px;
  padding: 0 6px;
  font-family: inherit;
  font-size: 12px;
  border: 1px solid var(--gp-grid-input-border);
  border-radius: 4px;
  background-color: var(--gp-grid-input-bg);
  color: var(--gp-grid-text);
  cursor: pointer;
}

.gp-grid-filter-row input[type="number"],
.gp-grid-filter-row input[type="date"],
.gp-grid-filter-row input[type="text"],
.gp-grid-filter-text-input {
  flex: 1;
  height: 30px;
  padding: 0 8px;
  font-family: inherit;
  font-size: 12px;
  border: 1px solid var(--gp-grid-input-border);
  border-radius: 4px;
  background-color: var(--gp-grid-input-bg);
  color: var(--gp-grid-text);
  min-width: 0;
  box-sizing: border-box;
}

.gp-grid-filter-row input:focus {
  outline: none;
  border-color: var(--gp-grid-primary);
}

.gp-grid-filter-to {
  font-size: 11px;
  color: var(--gp-grid-text-secondary);
}

.gp-grid-filter-remove {
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  border: none;
  border-radius: 3px;
  background-color: transparent;
  color: var(--gp-grid-text-muted);
  cursor: pointer;
}

.gp-grid-filter-remove:hover {
  background-color: var(--gp-grid-error-bg);
  color: var(--gp-grid-error-text);
}

/* AND/OR combination toggle */
.gp-grid-filter-combination {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.gp-grid-filter-combination button {
  flex: 1;
  padding: 4px 8px;
  font-size: 10px;
  font-family: inherit;
  border: 1px solid var(--gp-grid-input-border);
  border-radius: 3px;
  background-color: var(--gp-grid-bg);
  color: var(--gp-grid-text-secondary);
  cursor: pointer;
}

.gp-grid-filter-combination button.active {
  background-color: var(--gp-grid-primary);
  border-color: var(--gp-grid-primary);
  color: #fff;
}

/* Add condition button */
.gp-grid-filter-add {
  width: 100%;
  padding: 6px;
  font-size: 11px;
  font-family: inherit;
  border: 1px dashed var(--gp-grid-border);
  border-radius: 4px;
  background-color: transparent;
  color: var(--gp-grid-text-secondary);
  cursor: pointer;
}

.gp-grid-filter-add:hover {
  background-color: var(--gp-grid-hover);
  border-color: var(--gp-grid-primary);
  color: var(--gp-grid-primary);
}

/* Apply / Clear buttons */
.gp-grid-filter-buttons {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--gp-grid-border-light);
}

.gp-grid-filter-btn-clear,
.gp-grid-filter-btn-apply {
  flex: 1;
  padding: 8px 12px;
  font-size: 12px;
  font-family: inherit;
  border-radius: 4px;
  cursor: pointer;
}

.gp-grid-filter-btn-clear {
  border: 1px solid var(--gp-grid-input-border);
  background-color: var(--gp-grid-bg);
  color: var(--gp-grid-text);
}

.gp-grid-filter-btn-clear:hover {
  background-color: var(--gp-grid-hover);
}

.gp-grid-filter-btn-apply {
  border: 1px solid var(--gp-grid-primary);
  background-color: var(--gp-grid-primary);
  color: #fff;
}

.gp-grid-filter-btn-apply:hover {
  opacity: 0.9;
}
`;
