// packages/react/src/styles/container.ts
// Grid container base styles

export const containerStyles = `
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
  user-select: none;
  -webkit-user-select: none;
}

.gp-grid-container:focus {
  outline: none;
  border-color: var(--gp-grid-primary);
}
`;
