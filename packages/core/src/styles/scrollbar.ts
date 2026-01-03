// packages/core/src/styles/scrollbar.ts

// Custom scrollbar styles
export const scrollbarStyles: string = `
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
