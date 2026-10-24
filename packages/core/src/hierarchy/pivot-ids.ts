// packages/core/src/hierarchy/pivot-ids.ts
// Column and header group ids of a pivot schema (PRD 012 D2), over the group id path JSON.

import type { GroupPathStep } from "../types";
import { decodeGroupId, encodeGroupId } from "./group-path";
import { GROUP_ID_PREFIX } from "./keys";

export const PIVOT_LABEL_COLUMN_ID = "gp-pivot-label";

const COLUMN_PREFIX = "gp-pivot:";
const GROUP_PREFIX = "gp-pivot-group:";

const pathJson = (path: readonly GroupPathStep[]): string =>
  encodeGroupId(path).slice(GROUP_ID_PREFIX.length);

/** The column of `measure` at the leaf tuple `path`; `[]` is the measure's row total. */
export const encodePivotColumnId = (path: readonly GroupPathStep[], measure: string): string =>
  `${COLUMN_PREFIX}${pathJson(path)}|${measure}`;

/** The header group over the tuple prefix `path`; `[]` is the row totals group. */
export const encodePivotGroupId = (path: readonly GroupPathStep[]): string =>
  `${GROUP_PREFIX}${pathJson(path)}`;

/**
 * The tuple and measure of a pivot column id, or `undefined` when `id` is not one.
 * No proper prefix of a JSON array is itself one, so the first `|` after a parseable path ends it.
 */
export const decodePivotColumnId = (
  id: string,
): { path: GroupPathStep[]; measure: string } | undefined => {
  if (typeof id !== "string" || id.startsWith(COLUMN_PREFIX) === false) return undefined;
  const body = id.slice(COLUMN_PREFIX.length);
  let bar = body.indexOf("|");
  while (bar >= 0) {
    const path = decodeGroupId(GROUP_ID_PREFIX + body.slice(0, bar));
    if (path !== undefined) return { path, measure: body.slice(bar + 1) };
    bar = body.indexOf("|", bar + 1);
  }
  return undefined;
};
