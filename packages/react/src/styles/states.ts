// packages/react/src/styles/states.ts
// Loading, error, and empty state styles

export const statesStyles = `
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
`;
