// packages/core/src/styles/container.ts

// Grid container base styles
export const containerStyles: string = `
/* =============================================================================
   GP Grid - Clean Flat Design
   ============================================================================= */

/* Grid Container - structural */
.gp-grid-container {
  outline: none;
  user-select: none;
  -webkit-user-select: none;
}

/* Visual properties - :where() for zero specificity, consumers can override with a single class */
:where(.gp-grid-container) {
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
}

:where(.gp-grid-container:focus) {
  border-color: var(--gp-grid-primary);
}
`;
