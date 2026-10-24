import type { RowCacheEviction, RowCacheOptions } from "../types";

export interface NormalizedRowCacheOptions {
  pageSize: number;
  prefetchPages: number;
  maxPages: number;
}

export const DEFAULT_PAGE_SIZE = 100;

export const CACHE_PRESETS: Record<
  RowCacheEviction,
  Pick<NormalizedRowCacheOptions, "prefetchPages" | "maxPages">
> = {
  aggressive: { prefetchPages: 0, maxPages: 1 },
  balanced: { prefetchPages: 1, maxPages: 5 },
  conservative: { prefetchPages: 2, maxPages: 10 },
};

const positiveIntegerOrDefault = (
  value: number | undefined,
  fallback: number,
): number => {
  if (value === undefined) return fallback;
  if (Number.isFinite(value) && value > 0) return Math.floor(value);
  return fallback;
};

const nonNegativeIntegerOrDefault = (
  value: number | undefined,
  fallback: number,
): number => {
  if (value === undefined) return fallback;
  if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  return fallback;
};

export const normalizeRowCacheOptions = (
  options: RowCacheOptions | undefined,
): NormalizedRowCacheOptions => {
  const preset = CACHE_PRESETS[options?.eviction ?? "balanced"];
  return {
    pageSize: positiveIntegerOrDefault(options?.pageSize, DEFAULT_PAGE_SIZE),
    prefetchPages: nonNegativeIntegerOrDefault(
      options?.prefetchPages,
      preset.prefetchPages,
    ),
    maxPages: positiveIntegerOrDefault(options?.maxPages, preset.maxPages),
  };
};
