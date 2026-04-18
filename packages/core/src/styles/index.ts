// packages/core/src/styles/index.ts
// Combines all style modules and exports gridStyles

import { variablesStyles } from "./variables";
import { containerStyles } from "./container";
import { headerStyles } from "./header";
import { cellStyles } from "./cells";
import { statesStyles } from "./states";
import { scrollbarStyles } from "./scrollbar";
import { filtersStyles } from "./filters";
import { rowDragStyles } from "./row-drag";

/**
 * Combined grid styles from all modules.
 * Use `@gp-grid/core/dist/styles.css` in your app instead of consuming this directly.
 */
export const gridStyles: string = [
  variablesStyles,
  containerStyles,
  headerStyles,
  cellStyles,
  statesStyles,
  scrollbarStyles,
  filtersStyles,
  rowDragStyles,
].join("\n");

// Re-export individual style modules for advanced usage
export { variablesStyles } from "./variables";
export { containerStyles } from "./container";
export { headerStyles } from "./header";
export { cellStyles } from "./cells";
export { statesStyles } from "./states";
export { scrollbarStyles } from "./scrollbar";
export { filtersStyles } from "./filters";
export { rowDragStyles } from "./row-drag";
