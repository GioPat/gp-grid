// packages/core/src/utils/number-guards.ts
// Guards for numeric inputs that arrive from options, measurements or scroll
// samples, where NaN, Infinity or a negative value must not leak into layout.

/** Integer ≥ 1; anything else becomes 1. */
export const normalizePositiveInteger = (value: number): number =>
  Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;

/** Finite positive size; anything else becomes 0. */
export const normalizeSize = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

/** Truncated non-negative count; anything else becomes 0. */
export const normalizeCount = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;

/** Truncated into `[0, count]`; a non-finite value becomes 0. */
export const clampCount = (value: number, count: number): number => {
  const integer = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(Math.max(integer, 0), count);
};
