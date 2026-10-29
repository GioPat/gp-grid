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
  if (typeof renderer === "string") return filterRenderers[renderer] ?? globalFilterRenderer;
  if (renderer) return renderer as ReactFilterRenderer;
  return globalFilterRenderer;
};
