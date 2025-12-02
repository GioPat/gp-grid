// packages/react/src/styles.ts
// Dynamic CSS injection for gp-grid-react

const STYLE_ID = "gp-grid-styles";

export const gridStyles = `
/* =============================================================================
   GP Grid - CSS Variables for Theming
   ============================================================================= */

.gp-grid-container {
  /* Colors - Light Mode (default) */
  --gp-grid-bg: #ffffff;
  --gp-grid-bg-alt: #f8f9fa;
  --gp-grid-text: #212529;
  --gp-grid-text-secondary: #6c757d;
  --gp-grid-text-muted: #adb5bd;
  --gp-grid-border: #dee2e6;
  --gp-grid-border-light: #e9ecef;
  
  /* Header */
  --gp-grid-header-bg: #f1f3f5;
  --gp-grid-header-text: #212529;
  
  /* Selection */
  --gp-grid-primary: #228be6;
  --gp-grid-primary-light: #e7f5ff;
  --gp-grid-primary-border: #74c0fc;
  --gp-grid-hover: #f1f3f5;
  
  /* Filter */
  --gp-grid-filter-bg: #f8f9fa;
  --gp-grid-input-bg: #ffffff;
  --gp-grid-input-border: #ced4da;
  
  /* Error */
  --gp-grid-error-bg: #fff5f5;
  --gp-grid-error-text: #c92a2a;
  
  /* Loading */
  --gp-grid-loading-bg: rgba(255, 255, 255, 0.95);
  --gp-grid-loading-text: #495057;
  
  /* Scrollbar */
  --gp-grid-scrollbar-track: #f1f3f5;
  --gp-grid-scrollbar-thumb: #ced4da;
  --gp-grid-scrollbar-thumb-hover: #adb5bd;
}

/* Dark Mode */
.gp-grid-container--dark {
  --gp-grid-bg: #1a1b1e;
  --gp-grid-bg-alt: #25262b;
  --gp-grid-text: #c1c2c5;
  --gp-grid-text-secondary: #909296;
  --gp-grid-text-muted: #5c5f66;
  --gp-grid-border: #373a40;
  --gp-grid-border-light: #2c2e33;
  
  /* Header */
  --gp-grid-header-bg: #25262b;
  --gp-grid-header-text: #c1c2c5;
  
  /* Selection */
  --gp-grid-primary: #339af0;
  --gp-grid-primary-light: #1c3d5a;
  --gp-grid-primary-border: #1c7ed6;
  --gp-grid-hover: #2c2e33;
  
  /* Filter */
  --gp-grid-filter-bg: #25262b;
  --gp-grid-input-bg: #1a1b1e;
  --gp-grid-input-border: #373a40;
  
  /* Error */
  --gp-grid-error-bg: #2c1a1a;
  --gp-grid-error-text: #ff6b6b;
  
  /* Loading */
  --gp-grid-loading-bg: rgba(26, 27, 30, 0.95);
  --gp-grid-loading-text: #c1c2c5;
  
  /* Scrollbar */
  --gp-grid-scrollbar-track: #25262b;
  --gp-grid-scrollbar-thumb: #373a40;
  --gp-grid-scrollbar-thumb-hover: #4a4d52;
}

/* =============================================================================
   GP Grid - Clean Flat Design
   ============================================================================= */

/* Grid Container */
.gp-grid-container {
  outline: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--gp-grid-text);
  background-color: var(--gp-grid-bg);
  border: 1px solid var(--gp-grid-border);
  border-radius: 6px;
}

.gp-grid-container:focus {
  outline: none;
  border-color: var(--gp-grid-primary);
}

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

.gp-grid-sort-indicator {
  margin-left: 6px;
  font-size: 10px;
  color: var(--gp-grid-primary);
  display: flex;
  align-items: center;
}

.gp-grid-sort-index {
  font-size: 9px;
  margin-left: 2px;
  color: var(--gp-grid-text-secondary);
}

/* =============================================================================
   Filter Row
   ============================================================================= */

.gp-grid-filter-row {
  position: sticky;
  left: 0;
  z-index: 99;
  background-color: var(--gp-grid-filter-bg);
  border-bottom: 1px solid var(--gp-grid-border);
}

.gp-grid-filter-cell {
  position: absolute;
  box-sizing: border-box;
  border-right: 1px solid var(--gp-grid-border);
  padding: 6px 8px;
  display: flex;
  align-items: center;
  background-color: var(--gp-grid-filter-bg);
}

.gp-grid-filter-input {
  width: 100%;
  height: 28px;
  padding: 0 10px;
  font-family: inherit;
  font-size: 12px;
  border: 1px solid var(--gp-grid-input-border);
  border-radius: 4px;
  background-color: var(--gp-grid-input-bg);
  color: var(--gp-grid-text);
  transition: border-color 0.15s ease;
}

.gp-grid-filter-input:focus {
  outline: none;
  border-color: var(--gp-grid-primary);
}

.gp-grid-filter-input::placeholder {
  color: var(--gp-grid-text-muted);
}

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

/* =============================================================================
   Loading & Error States
   ============================================================================= */

.gp-grid-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 12px 20px;
  background-color: var(--gp-grid-loading-bg);
  color: var(--gp-grid-loading-text);
  border-radius: 6px;
  border: 1px solid var(--gp-grid-border);
  font-weight: 500;
  font-size: 13px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 10px;
}

.gp-grid-loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--gp-grid-border);
  border-top-color: var(--gp-grid-primary);
  border-radius: 50%;
  animation: gp-grid-spin 0.7s linear infinite;
}

@keyframes gp-grid-spin {
  to {
    transform: rotate(360deg);
  }
}

.gp-grid-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 12px 20px;
  background-color: var(--gp-grid-error-bg);
  color: var(--gp-grid-error-text);
  border-radius: 6px;
  border: 1px solid var(--gp-grid-error-text);
  font-weight: 500;
  font-size: 13px;
  z-index: 1000;
  max-width: 80%;
  text-align: center;
}

/* =============================================================================
   Empty State
   ============================================================================= */

.gp-grid-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--gp-grid-text-muted);
  font-size: 14px;
  text-align: center;
}

/* =============================================================================
   Scrollbar Styling
   ============================================================================= */

.gp-grid-container::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.gp-grid-container::-webkit-scrollbar-track {
  background-color: var(--gp-grid-scrollbar-track);
}

.gp-grid-container::-webkit-scrollbar-thumb {
  background-color: var(--gp-grid-scrollbar-thumb);
  border-radius: 4px;
}

.gp-grid-container::-webkit-scrollbar-thumb:hover {
  background-color: var(--gp-grid-scrollbar-thumb-hover);
}

.gp-grid-container::-webkit-scrollbar-corner {
  background-color: var(--gp-grid-scrollbar-track);
}
`;

let stylesInjected = false;

/**
 * Inject grid styles into the document head.
 * This is called automatically when the Grid component mounts.
 * Styles are only injected once, even if multiple Grid instances exist.
 */
export function injectStyles(): void {
  if (stylesInjected) return;
  if (typeof document === "undefined") return; // SSR safety

  // Check if styles already exist (e.g., from a previous mount)
  if (document.getElementById(STYLE_ID)) {
    stylesInjected = true;
    return;
  }

  const styleElement = document.createElement("style");
  styleElement.id = STYLE_ID;
  styleElement.textContent = gridStyles;
  document.head.appendChild(styleElement);
  stylesInjected = true;
}
