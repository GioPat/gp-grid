// packages/core/src/geometry/column-order.ts
// Pure id-array operations over the region partition. The base order is the
// model's authoritative `orderIds`; the resolved layout is its stable
// partition by requested pin, so every index space stays contiguous in
// visual order.

import type { ColumnPin, ColumnRegion } from "../types/geometry";

export interface ColumnPartition {
  readonly start: string[];
  readonly center: string[];
  readonly end: string[];
}

const REGIONS: readonly ColumnRegion[] = ["start", "center", "end"];

export const regionOfPin = (pin: ColumnPin | null): ColumnRegion => pin ?? "center";

/** Stable partition of a base order into `start | center | end`. */
export const partitionByPin = (
  baseOrder: readonly string[],
  getPin: (columnId: string) => ColumnPin | null,
): ColumnPartition => {
  const buckets: Record<ColumnRegion, string[]> = { start: [], center: [], end: [] };
  for (const columnId of baseOrder) {
    buckets[regionOfPin(getPin(columnId))].push(columnId);
  }
  return { start: buckets.start, center: buckets.center, end: buckets.end };
};

export const flattenPartition = (partition: ColumnPartition): string[] => [
  ...partition.start,
  ...partition.center,
  ...partition.end,
];

/**
 * Insert selected definition ids around a retained user order. Each inserted
 * id is placed before the next retained id in definition order, or at the end.
 */
export const insertByDefinitionOrder = (
  retainedOrder: readonly string[],
  definitionOrder: readonly string[],
  inserted: ReadonlySet<string>,
): string[] => {
  const retained = new Set(retainedOrder);
  const beforeAnchor = new Map<string, string[]>();
  let pending: string[] = [];

  for (const columnId of definitionOrder) {
    if (inserted.has(columnId)) {
      pending.push(columnId);
      continue;
    }
    if (retained.has(columnId) === false || pending.length === 0) continue;
    beforeAnchor.set(columnId, pending);
    pending = [];
  }

  const next: string[] = [];
  for (const columnId of retainedOrder) {
    const additions = beforeAnchor.get(columnId);
    if (additions !== undefined) next.push(...additions);
    next.push(columnId);
  }
  next.push(...pending);
  return next;
};

/** First index of a region in the partitioned order, and its exclusive end. */
export const regionBounds = (
  partition: ColumnPartition,
  region: ColumnRegion,
): { start: number; end: number } => {
  let start = 0;
  for (const candidate of REGIONS) {
    if (candidate === region) break;
    start += partition[candidate].length;
  }
  return { start, end: start + partition[region].length };
};

/** Clamp a target layout index into the region the column currently occupies. */
export const clampIndexToRegion = (
  partition: ColumnPartition,
  columnId: string,
  target: number,
): number | null => {
  for (const region of REGIONS) {
    const bounds = regionBounds(partition, region);
    if (partition[region].includes(columnId) === false) continue;
    return Math.min(Math.max(target, bounds.start), bounds.end - 1);
  }
  return null;
};

/** Base-order index of the column that renders at a partitioned layout index. */
export const baseIndexOfLayout = (
  baseOrder: readonly string[],
  layoutOrder: readonly string[],
  layoutIndex: number,
): number | null => {
  const columnId = layoutOrder[layoutIndex];
  if (columnId === undefined) return null;
  const baseIndex = baseOrder.indexOf(columnId);
  return baseIndex === -1 ? null : baseIndex;
};
