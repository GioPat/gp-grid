// packages/core/src/styles/states.ts

// Loading, error, and empty state styles
export const statesStyles: string = `
/* =============================================================================
   Loading & Error States
   ============================================================================= */

/* Sticky wrapper: stays pinned at viewport top, takes no layout space */
.gp-grid-loading-anchor {
  position: sticky;
  top: 0;
  left: 0;
  height: 0;
  z-index: 900;
  overflow: visible;
  pointer-events: none;
}

/* Semi-transparent overlay covering the visible viewport area */
.gp-grid-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

:where(.gp-grid-loading-overlay) {
  background-color: var(--gp-grid-loading-overlay-bg, rgba(255, 255, 255, 0.4));
}

:where(.gp-grid-container--dark .gp-grid-loading-overlay) {
  background-color: var(--gp-grid-loading-overlay-bg, rgba(0, 0, 0, 0.3));
}

/* Loading indicator centered in the visible viewport */
.gp-grid-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  display: flex;
  pointer-events: auto;
}

:where(.gp-grid-loading) {
  align-items: center;
  padding: 12px 20px;
  background-color: var(--gp-grid-loading-bg);
  color: var(--gp-grid-loading-text);
  border-radius: 6px;
  border: 1px solid var(--gp-grid-border);
  font-weight: 500;
  font-size: 13px;
  gap: 10px;
}

.gp-grid-loading-spinner {
  width: 16px;
  height: 16px;
  animation: gp-grid-spin 0.7s linear infinite;
}

:where(.gp-grid-loading-spinner) {
  border: 2px solid var(--gp-grid-border);
  border-top-color: var(--gp-grid-primary);
  border-radius: 50%;
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
  z-index: 1000;
  user-select: text;
  -webkit-user-select: text;
}

:where(.gp-grid-error) {
  padding: 12px 20px;
  background-color: var(--gp-grid-error-bg);
  color: var(--gp-grid-error-text);
  border-radius: 6px;
  border: 1px solid var(--gp-grid-error-text);
  font-weight: 500;
  font-size: 13px;
  max-width: 80%;
  text-align: center;
  cursor: text;
}

/* =============================================================================
   Empty State
   ============================================================================= */

.gp-grid-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

:where(.gp-grid-empty) {
  color: var(--gp-grid-text-muted);
  font-size: 14px;
  text-align: center;
}
`;
