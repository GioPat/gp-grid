// packages/core/src/styles/variables.ts

// CSS Variables for theming (light and dark modes)
export const variablesStyles: string = `
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
`;
