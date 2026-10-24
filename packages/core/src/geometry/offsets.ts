// packages/core/src/geometry/offsets.ts

/**
 * Build cumulative edge offsets: `sizes.length + 1` entries starting at 0,
 * where `offsets[i + 1] - offsets[i]` is `sizes[i]`. Every size must be a
 * positive finite number so the resulting offsets stay strictly increasing.
 */
export const buildOffsets = (sizes: readonly number[]): number[] => {
  const offsets = new Array<number>(sizes.length + 1);
  offsets[0] = 0;
  let running = 0;
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i]!;
    if (!Number.isFinite(size) || size <= 0) {
      throw new RangeError(`Invalid axis size at index ${i}: ${size}`);
    }
    const next = running + size;
    // A size below float64 resolution at this magnitude leaves the sum flat,
    // and the binary search needs strictly increasing edges.
    if (!Number.isFinite(next) || next <= running) {
      throw new RangeError("Axis offsets exceeded the representable range");
    }
    running = next;
    offsets[i + 1] = running;
  }
  return offsets;
};

/**
 * Index of the last edge at or before `offset`; `-1` when the value precedes
 * the first edge. Clamped by callers that need an item index.
 */
export const searchOffsets = (offsets: readonly number[], offset: number): number => {
  if (offsets.length === 0 || Number.isNaN(offset) || offset < offsets[0]!) {
    return -1;
  }
  const lastIndex = offsets.length - 1;
  if (offset >= offsets[lastIndex]!) {
    return lastIndex;
  }
  let low = 0;
  let high = lastIndex;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (offsets[mid]! <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
};

/**
 * Clamp an offset-derived index into `[0, count]`; an empty axis has no index
 * to report, so it answers `-1`.
 */
export const clampIndex = (index: number, count: number): number => {
  if (count <= 0) {
    return -1;
  }
  const integer = Math.trunc(index);
  if (Number.isNaN(integer)) {
    return 0;
  }
  return Math.min(Math.max(integer, 0), count);
};

export const assertPositiveFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Invalid ${label}: ${value}`);
  }
};

export const assertCount = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Invalid ${label}: ${value}`);
  }
};

export const assertOverscan = (value: number): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Invalid overscan: ${value}`);
  }
};

/** Integer index queries require a safe integer; sentinels stay caller-owned. */
export const assertSafeIndex = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Invalid ${label}: ${value}`);
  }
};
