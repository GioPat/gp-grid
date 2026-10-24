// packages/core/tests/override-axis.bench.ts
// E1 of PRD 006: the override axis against the dense prefix axis. Storage and
// per-query cost decide D3; the decision rule is in the plan (step 9).
//
//   pnpm --filter @gp-grid/core exec vitest bench --run tests/override-axis.bench.ts

import { bench, describe } from "vitest";
import { createFixedAxis } from "../src/geometry/fixed-axis";
import { createOverrideAxis, type PlacedRowSize } from "../src/geometry/override-axis";
import { createPrefixAxis } from "../src/geometry/prefix-axis";
import type { VirtualAxis } from "../src/geometry/virtual-axis";
import { RowHeightOverrides, type LocateRowIds } from "../src/managers/row-height-overrides";
import type { RowId } from "../src/types";

const N = 10_000_000;
const DENSE_N = 1_000_000;
const OVERRIDE_COUNTS = [1, 100, 10_000, 100_000];
const DEFAULT_SIZE = 32;
const VIEWPORT = 720;
const OVERSCAN = 10;
const LOOKUPS = 100_000;
const WINDOWS = 10_000;

/** Overrides sit on a 1/64 px grid, so every running sum stays exact. */
const QUANTUM = 64;

const createRandom = (seed: number) => {
  let state = seed >>> 0;
  return (limit: number): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state % limit;
  };
};

/** K distinct random indices, ascending, with a size in [16, 256). */
const createPlaced = (count: number, k: number): PlacedRowSize[] => {
  const random = createRandom(0x9e3779b9 ^ k);
  const indices = new Set<number>();
  while (indices.size < k) {
    indices.add(random(count));
  }
  return [...indices]
    .sort((a, b) => a - b)
    .map((index) => ({ index, size: (16 * QUANTUM + random(240 * QUANTUM)) / QUANTUM }));
};

const randomOffsets = (count: number, extent: number): number[] => {
  const random = createRandom(0x51ed270b);
  return Array.from({ length: Math.max(LOOKUPS, WINDOWS) }, () => random(extent));
};

const fixed = createFixedAxis(N, DEFAULT_SIZE);
const denseSizes = new Array<number>(DENSE_N).fill(DEFAULT_SIZE);
const densePlaced = createPlaced(DENSE_N, 100);
for (const entry of densePlaced) {
  denseSizes[entry.index] = entry.size;
}
const denseAxis = createPrefixAxis(denseSizes);
const offsets = randomOffsets(N, fixed.extent);

const axes: Array<{ label: string; axis: VirtualAxis; memory: string }> = [
  { label: `fixed N=${N}`, axis: fixed, memory: "0 B" },
];
for (const k of OVERRIDE_COUNTS) {
  const placed = createPlaced(N, k);
  axes.push({
    label: `override N=${N} K=${k}`,
    axis: createOverrideAxis(N, DEFAULT_SIZE, placed),
    // indices + sizes + the K + 1 running deltas.
    memory: `${((2 * k + (k + 1)) * 8) / 1024} KiB`,
  });
}
axes.push({
  label: `dense prefix N=${DENSE_N}`,
  axis: denseAxis,
  memory: `${(DENSE_N * 8) / 1024 / 1024} MiB`,
});

// Storage the axes hold, computed from their arrays rather than heap-sampled.
console.table(axes.map(({ label, memory }) => ({ axis: label, arrays: memory })));

describe("E1 — one update near row 0", () => {
  const updateOffset = 4;
  // 100 updates per sample, so the two cases share a scale. The dense axis
  // copies 1,000,001 numbers per update, which is the point of the comparison;
  // one sample is enough to place its mean three orders of magnitude away.
  const BATCH = 100;
  const k10k = createPlaced(N, 10_000);
  bench(`${BATCH}× (copy the dense array + createPrefixAxis) N=${DENSE_N}`, () => {
    for (let at = 0; at < BATCH; at++) {
      const copy = [...denseSizes];
      copy[updateOffset] = 96;
      createPrefixAxis(copy);
    }
  }, { iterations: 1, warmupIterations: 0 });
  bench(`${BATCH}× (placed array + createOverrideAxis) N=${N} K=10,000`, () => {
    for (let at = 0; at < BATCH; at++) {
      const placed = [...k10k, { index: updateOffset, size: 96 }]
        .sort((a, b) => a.index - b.index);
      createOverrideAxis(N, DEFAULT_SIZE, placed);
    }
  }, { iterations: 20, warmupIterations: 1 });
});

for (const entry of axes) {
  bench(`${entry.label} — ${LOOKUPS / 1000}k getOffset`, () => {    let total = 0;
    for (let at = 0; at < LOOKUPS; at++) {
      total += entry.axis.getOffset(offsets[at]! % entry.axis.count);
    }
    if (total === Number.POSITIVE_INFINITY) throw new Error("unreachable");
  });

  bench(`${entry.label} — ${LOOKUPS / 1000}k indexAt`, () => {
    let total = 0;
    for (let at = 0; at < LOOKUPS; at++) {
      total += entry.axis.indexAt(offsets[at]! % entry.axis.extent);
    }
    if (total === Number.POSITIVE_INFINITY) throw new Error("unreachable");
  });

  bench(`${entry.label} — ${WINDOWS / 1000}k getWindow`, () => {
    let total = 0;
    for (let at = 0; at < WINDOWS; at++) {
      const window = entry.axis.getWindow(offsets[at]! % entry.axis.extent, VIEWPORT, OVERSCAN);
      total += window.end - window.start;
    }
    if (total === Number.POSITIVE_INFINITY) throw new Error("unreachable");
  });
}

// Slice 2: D6 re-places the overrides with one resident scan per data
// revision, so the worst case is K identities at the far end of the cache.
describe(`E1b — re-placement scan over ${DENSE_N / 1_000_000}M resident rows`, () => {
  const K = 100;
  const resident = new Map<number, { id: number }>();
  for (let index = 0; index < DENSE_N; index += 1) resident.set(index, { id: index });
  const lastIds = Array.from({ length: K }, (_, at) => DENSE_N - 1 - at);

  const scan: LocateRowIds = (wanted) => {
    const found = new Map<RowId, number>();
    for (const index of resident.keys()) {
      if (found.size === wanted.size) break;
      const rowId = resident.get(index)?.id;
      if (rowId !== undefined && wanted.has(rowId)) found.set(rowId, index);
    }
    return found;
  };
  const overrides = new RowHeightOverrides({
    getRowHeight: () => DEFAULT_SIZE,
    getRowCount: () => DENSE_N,
    hasStableIdentity: () => true,
    getDataRevision: () => 0,
  });
  overrides.set(lastIds.map((rowId) => ({ rowId, height: 96 })), scan);

  let revision = 0;
  bench(`K=${K} over ${DENSE_N / 1_000_000}M resident rows`, () => {
    revision += 1;
    const placed = overrides.getPlaced({
      revision,
      rowCount: DENSE_N,
      defaultSize: DEFAULT_SIZE,
      stableIdentity: true,
      scan,
    });
    if (placed.length !== K) throw new Error("unreachable");
  });
});
