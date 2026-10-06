// packages/core/src/row-grouping/group-order.ts
// The order of sibling groups at each depth (D9).

import { compareValues } from "../indexed-data-store/sorting";
import type { CellValue, FlatRowSource, SortDirection } from "../types";
import type { TreeLevel } from "./group-layout";
import { keyTagOf } from "./keys";

type Direction = 1 | -1;

export type LevelOrder =
  | { by: "key"; direction: Direction }
  | { by: "measure"; field: string; direction: Direction };

const KEY_ASCENDING: LevelOrder = { by: "key", direction: 1 };

const directionOf = (direction: SortDirection): Direction => (direction === "desc" ? -1 : 1);

/**
 * A dimension whose column is sorted orders by key in that direction; otherwise a
 * measure sorted first orders by its aggregate; otherwise keys ascend.
 */
export const resolveLevelOrders = (
  source: Pick<FlatRowSource, "sort" | "fieldOf">,
  dimensionFields: readonly string[],
  measureFields: readonly string[],
): LevelOrder[] => {
  const sorted = source.sort.filter((entry) => entry.direction !== null);
  const first = sorted[0];
  const firstField = first === undefined ? undefined : source.fieldOf(first.colId);
  const fallback: LevelOrder =
    first !== undefined && firstField !== undefined && measureFields.includes(firstField)
      ? { by: "measure", field: firstField, direction: directionOf(first.direction) }
      : KEY_ASCENDING;
  return dimensionFields.map((field) => {
    const entry = sorted.find((candidate) => source.fieldOf(candidate.colId) === field);
    return entry === undefined ? fallback : { by: "key", direction: directionOf(entry.direction) };
  });
};

// By tag + 1: number, date, boolean, string, object, then null last as `compareValues` puts it.
const TAG_RANK = [4, 5, 3, 0, 2, 1] as const;

const rankOf = (tag: number): number => TAG_RANK[tag + 1]!;

/** Values of different type tags order by tag, so mixed siblings order totally. */
export const compareTagged = (tagA: number, a: CellValue, tagB: number, b: CellValue): number =>
  tagA === tagB ? compareValues(a, b) : rankOf(tagA) - rankOf(tagB);

export const keyComparator =
  (level: TreeLevel, direction: Direction) =>
  (a: number, b: number): number =>
    direction * compareTagged(level.tag[a]!, level.key[a]!, level.tag[b]!, level.key[b]!);

export const measureComparator = (valueOf: (local: number) => CellValue, direction: Direction) => {
  return (a: number, b: number): number => {
    const x = valueOf(a);
    const y = valueOf(b);
    return direction * compareTagged(keyTagOf(x), x, keyTagOf(y), y);
  };
};
