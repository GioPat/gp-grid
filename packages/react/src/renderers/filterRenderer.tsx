// packages/react/src/renderers/filterRenderer.tsx

import type { ColumnDefinition } from "@gp-grid/core";
import type { ReactFilterRenderer } from "../types";

/** Column renderer (inline or registry key), else the global one; `undefined` keeps the built-in content. */
export const resolveFilterRenderer = (
  column: ColumnDefinition,
  filterRenderers: Record<string, ReactFilterRenderer>,
  globalFilterRenderer?: ReactFilterRenderer,
): ReactFilterRenderer | undefined => {
  const renderer = column.filterRenderer;
  if (typeof renderer === "function") return renderer as ReactFilterRenderer;
  if (typeof renderer === "string" && filterRenderers[renderer]) {
    return filterRenderers[renderer];
  }
  return globalFilterRenderer;
};
