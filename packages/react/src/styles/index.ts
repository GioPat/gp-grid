// packages/react/src/styles/index.ts
// Combines all style modules and exports injectStyles

import { variablesStyles } from "./variables";
import { containerStyles } from "./container";
import { headerStyles } from "./header";
import { cellStyles } from "./cells";
import { statesStyles } from "./states";
import { scrollbarStyles } from "./scrollbar";
import { filtersStyles } from "./filters";

const STYLE_ID = "gp-grid-styles";

/**
 * Combined grid styles from all modules
 */
export const gridStyles = [
  variablesStyles,
  containerStyles,
  headerStyles,
  cellStyles,
  statesStyles,
  scrollbarStyles,
  filtersStyles,
].join("\n");

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

// Re-export individual style modules for advanced usage
export { variablesStyles } from "./variables";
export { containerStyles } from "./container";
export { headerStyles } from "./header";
export { cellStyles } from "./cells";
export { statesStyles } from "./states";
export { scrollbarStyles } from "./scrollbar";
export { filtersStyles } from "./filters";
