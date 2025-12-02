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
  --gp-grid-bg-alt: #fafafa;
  --gp-grid-text: #212121;
  --gp-grid-text-secondary: #757575;
  --gp-grid-text-muted: #9e9e9e;
  --gp-grid-border: #e0e0e0;
  --gp-grid-border-dark: #d0d0d0;
  
  /* Header */
  --gp-grid-header-bg: linear-gradient(180deg, #fafafa 0%, #f0f0f0 100%);
  --gp-grid-header-text: #1a1a1a;
  
  /* Selection */
  --gp-grid-primary: #1976d2;
  --gp-grid-primary-light: #e3f2fd;
  --gp-grid-primary-border: #64b5f6;
  --gp-grid-hover: #f0f7ff;
  
  /* Filter */
  --gp-grid-filter-bg: #f5f5f5;
  --gp-grid-input-bg: #ffffff;
  
  /* Error */
  --gp-grid-error-bg: #ffebee;
  --gp-grid-error-text: #c62828;
  
  /* Loading */
  --gp-grid-loading-bg: rgba(255, 255, 255, 0.95);
  --gp-grid-loading-text: #424242;
  
  /* Scrollbar */
  --gp-grid-scrollbar-track: #f5f5f5;
  --gp-grid-scrollbar-thumb: #bdbdbd;
  --gp-grid-scrollbar-thumb-hover: #9e9e9e;
}

/* Dark Mode */
.gp-grid-container--dark {
  --gp-grid-bg: #1e1e1e;
  --gp-grid-bg-alt: #252525;
  --gp-grid-text: #e0e0e0;
  --gp-grid-text-secondary: #a0a0a0;
  --gp-grid-text-muted: #707070;
  --gp-grid-border: #3a3a3a;
  --gp-grid-border-dark: #4a4a4a;
  
  /* Header */
  --gp-grid-header-bg: linear-gradient(180deg, #2a2a2a 0%, #1e1e1e 100%);
  --gp-grid-header-text: #e0e0e0;
  
  /* Selection */
  --gp-grid-primary: #64b5f6;
  --gp-grid-primary-light: #1a3a5c;
  --gp-grid-primary-border: #42a5f5;
  --gp-grid-hover: #2a3a4a;
  
  /* Filter */
  --gp-grid-filter-bg: #252525;
  --gp-grid-input-bg: #1e1e1e;
  
  /* Error */
  --gp-grid-error-bg: #4a1a1a;
  --gp-grid-error-text: #ff8a80;
  
  /* Loading */
  --gp-grid-loading-bg: rgba(30, 30, 30, 0.95);
  --gp-grid-loading-text: #e0e0e0;
  
  /* Scrollbar */
  --gp-grid-scrollbar-track: #2a2a2a;
  --gp-grid-scrollbar-thumb: #4a4a4a;
  --gp-grid-scrollbar-thumb-hover: #5a5a5a;
}

/* =============================================================================
   GP Grid - Material UI Inspired Styling
   ============================================================================= */

/* Grid Container */
.gp-grid-container {
  outline: none;
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Oxygen, Ubuntu, Cantarell, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--gp-grid-text);
  background-color: var(--gp-grid-bg);
  border: 1px solid var(--gp-grid-border);
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.gp-grid-container:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2);
}

/* =============================================================================
   Header
   ============================================================================= */

.gp-grid-header {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 100;
  background: var(--gp-grid-header-bg);
  border-bottom: 1px solid var(--gp-grid-border);
}

.gp-grid-container .gp-grid-header-cell {
  position: absolute;
  box-sizing: border-box;
  border-right: 1px solid var(--gp-grid-border-dark);
  font-weight: 600;
  font-size: 13px;
  color: var(--gp-grid-header-text) !important;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: transparent;
  transition: background-color 0.15s ease;
}

.gp-grid-container .gp-grid-header-cell:hover {
  background-color: rgba(0, 0, 0, 0.06);
}

.gp-grid-container--dark .gp-grid-header-cell:hover {
  background-color: rgba(255, 255, 255, 0.06);
}

.gp-grid-container .gp-grid-header-cell:active {
  background-color: rgba(0, 0, 0, 0.1);
}

.gp-grid-container--dark .gp-grid-header-cell:active {
  background-color: rgba(255, 255, 255, 0.1);
}

.gp-grid-container .gp-grid-header-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--gp-grid-header-text) !important;
}

.gp-grid-sort-indicator {
  margin-left: 4px;
  font-size: 12px;
  color: var(--gp-grid-primary);
  display: flex;
  align-items: center;
}

.gp-grid-sort-index {
  font-size: 10px;
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
  background: var(--gp-grid-filter-bg);
  border-bottom: 1px solid var(--gp-grid-border);
}

.gp-grid-filter-cell {
  position: absolute;
  box-sizing: border-box;
  border-right: 1px solid var(--gp-grid-border);
  padding: 4px 8px;
  display: flex;
  align-items: center;
  background: var(--gp-grid-filter-bg);
}

.gp-grid-filter-input {
  width: 100%;
  height: 28px;
  padding: 4px 8px;
  font-family: inherit;
  font-size: 12px;
  border: 1px solid var(--gp-grid-border-dark);
  border-radius: 4px;
  background: var(--gp-grid-input-bg);
  color: var(--gp-grid-text);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.gp-grid-filter-input:focus {
  outline: none;
  border-color: var(--gp-grid-primary);
  box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.15);
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
  border-right: 1px solid var(--gp-grid-border);
  border-bottom: 1px solid var(--gp-grid-border);
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
  padding: 0 11px; /* Adjust for thicker border */
}

/* Selected cells (range selection) */
.gp-grid-cell--selected {
  background-color: var(--gp-grid-primary-light) !important;
  border-color: var(--gp-grid-primary-border) !important;
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
  border: 1px solid var(--gp-grid-bg);
  cursor: crosshair;
  z-index: 15;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.gp-grid-fill-handle:hover {
  transform: scale(1.2);
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
  background: transparent;
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
  padding: 12px 24px;
  background: var(--gp-grid-loading-bg);
  color: var(--gp-grid-loading-text);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-weight: 500;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 12px;
}

.gp-grid-loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--gp-grid-border);
  border-top-color: var(--gp-grid-primary);
  border-radius: 50%;
  animation: gp-grid-spin 0.8s linear infinite;
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
  padding: 12px 24px;
  background: var(--gp-grid-error-bg);
  color: var(--gp-grid-error-text);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  font-weight: 500;
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
  width: 10px;
  height: 10px;
}

.gp-grid-container::-webkit-scrollbar-track {
  background: var(--gp-grid-scrollbar-track);
}

.gp-grid-container::-webkit-scrollbar-thumb {
  background: var(--gp-grid-scrollbar-thumb);
  border-radius: 5px;
  border: 2px solid var(--gp-grid-scrollbar-track);
}

.gp-grid-container::-webkit-scrollbar-thumb:hover {
  background: var(--gp-grid-scrollbar-thumb-hover);
}

.gp-grid-container::-webkit-scrollbar-corner {
  background: var(--gp-grid-scrollbar-track);
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
