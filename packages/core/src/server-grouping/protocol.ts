// packages/core/src/server-grouping/protocol.ts
// The checks a service response passes before it touches a branch (PRD 009 D1).

import type {
  DataSourceRange,
  ServerGroupChildrenRequest,
  ServerGroupChildrenResponse,
  ServerGroupNode,
  ServerLeavesRequest,
  ServerLeavesResponse,
} from "../types";
import { TAG_OBJECT, keyTagOf } from "../hierarchy/keys";

/** An error message, or `null` when the check passes. */
type Check = string | null;

const checkRevision = (expected: number | null, revision: number): Check => {
  if (expected === null || revision === expected) return null;
  return `Stale revision ${revision}, expected ${expected}`;
};

const isCount = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

const checkCount = (totalCount: number, declaredCount: number | null): Check => {
  if (isCount(totalCount) === false) return `Invalid totalCount: ${totalCount}`;
  if (declaredCount === null || totalCount === declaredCount) return null;
  return `totalCount ${totalCount} differs from the declared ${declaredCount}`;
};

/** `children[i]` is ordinal `startRow + i`, so a page holds exactly the range clipped to the count. */
const checkLength = (range: DataSourceRange, totalCount: number, length: number, noun: string): Check => {
  const expected = Math.max(Math.min(range.endRow, totalCount) - range.startRow, 0);
  if (length === expected) return null;
  const kind = length > expected ? "long" : "short";
  return `Page too ${kind}: ${length} ${noun} for ${expected}`;
};

const checkKeys = (range: DataSourceRange, children: readonly ServerGroupNode[]): Check => {
  const offset = children.findIndex((node) => keyTagOf(node.key) === TAG_OBJECT);
  return offset < 0 ? null : `Invalid group key at child ${range.startRow + offset}`;
};

/** `declaredCount` is `null` for the root request of a new view, which may report any count. */
export const checkChildren = (
  request: ServerGroupChildrenRequest,
  response: ServerGroupChildrenResponse,
  declaredCount: number | null,
): Check =>
  checkRevision(request.revision, response.revision) ??
  checkCount(response.totalCount, declaredCount) ??
  checkLength(request.range, response.totalCount, response.children.length, "children") ??
  checkKeys(request.range, response.children);

export const checkLeaves = <TData>(
  request: ServerLeavesRequest,
  response: ServerLeavesResponse<TData>,
  declaredCount: number,
): Check =>
  checkRevision(request.revision, response.revision) ??
  checkCount(response.totalCount, declaredCount) ??
  checkLength(request.range, response.totalCount, response.rows.length, "rows");
