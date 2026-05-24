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

:where(.gp-grid-container)::-webkit-scrollbar-track {
  background-color: var(--gp-grid-scrollbar-track);
}

:where(.gp-grid-container)::-webkit-scrollbar-thumb {
  background-color: var(--gp-grid-scrollbar-thumb);
  border-radius: 4px;
}

:where(.gp-grid-container)::-webkit-scrollbar-thumb:hover {
  background-color: var(--gp-grid-scrollbar-thumb-hover);
}

:where(.gp-grid-container)::-webkit-scrollbar-corner {
  background-color: var(--gp-grid-scrollbar-track);
}
`;
