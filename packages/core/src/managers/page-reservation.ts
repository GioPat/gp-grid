// packages/core/src/managers/page-reservation.ts
// C8 page admission: optional overscan/prefetch pages within capacity, prefix
// reservations and eviction ordering.

import { normalizeCount, normalizePositiveInteger } from "../utils/number-guards";
import { blocksOfRange, prefixRangeOf, type BlockRange } from "./page-blocks";

export interface OptionalPageAdmission {
  required: readonly number[];
  loaded: readonly number[];
  reserved: readonly number[];
  maxPages: number;
  overscan?: readonly number[];
  prefetch?: readonly number[];
  gap?: BlockRange | null;
}

export interface PrefixReservation {
  readonly pages: readonly number[];
  readonly released: readonly number[];
}

const distanceToRequired = (block: number, required: readonly number[]): number => {
  let nearest = Number.POSITIVE_INFINITY;
  for (const page of required) nearest = Math.min(nearest, Math.abs(page - block));
  return nearest;
};

const inGap = (block: number, gap: BlockRange | null): boolean =>
  gap !== null && block >= gap.start && block < gap.end;

/** Nearest required pages first, ascending block index breaking ties. */
const orderOptional = (
  candidates: readonly number[],
  required: readonly number[],
  gap: BlockRange | null,
): number[] =>
  [...new Set(candidates)]
    .filter((block) => inGap(block, gap) === false)
    .map((block) => ({ block, distance: distanceToRequired(block, required) }))
    .sort((a, b) => a.distance - b.distance || a.block - b.block)
    .map((entry) => entry.block);

/**
 * Optional pages admitted while capacity remains: overscan before prefetch,
 * nearest first. Required pages count against the cap even before they load.
 */
export const admitOptionalPages = (input: OptionalPageAdmission): number[] => {
  const required = new Set(input.required);
  const used = new Set([...required, ...input.loaded, ...input.reserved]);
  const capacity = Math.max(normalizePositiveInteger(input.maxPages), required.size);
  const admitted: number[] = [];
  for (const group of [input.overscan ?? [], input.prefetch ?? []]) {
    for (const block of orderOptional(group, input.required, input.gap ?? null)) {
      if (used.size >= capacity) return admitted;
      if (used.has(block)) continue;
      used.add(block);
      admitted.push(block);
    }
  }
  return admitted;
};

export interface EvictionInput {
  loaded: readonly number[];
  protectedBlocks: readonly number[];
  center: number;
}

/**
 * Loaded pages that may be evicted: unprotected ones, farthest from the
 * center first; ties keep load order, as the flat loader always did.
 */
export const evictionCandidates = (input: EvictionInput): number[] => {
  const protectedSet = new Set(input.protectedBlocks);
  return input.loaded
    .filter((block) => protectedSet.has(block) === false)
    .sort((a, b) => Math.abs(b - input.center) - Math.abs(a - input.center));
};

/** Prefix blocks for the current count; blocks outside it are reported as released. */
export const resolvePrefixReservations = (
  previous: readonly number[],
  frozenCount: number,
  pageSize: number,
): PrefixReservation => {
  const range = prefixRangeOf(normalizeCount(frozenCount), normalizePositiveInteger(pageSize));
  const pages = blocksOfRange(range);
  const kept = new Set(pages);
  return { pages, released: previous.filter((block) => kept.has(block) === false) };
};
