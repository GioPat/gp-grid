// packages/core/tests/chunk-splitter.test.ts
// Boundary conditions for chunk-sizing. Small file but used by all three
// parallel sort variants.

import { describe, it, expect } from "vitest";
import { calculateChunkBoundaries } from "../src/sorting/chunk-splitter";

describe("calculateChunkBoundaries", () => {
  it("length 0: empty result", () => {
    expect(calculateChunkBoundaries(0, 4, 1000)).toEqual([]);
  });

  it("length < minChunkSize: a single chunk covering everything", () => {
    const boundaries = calculateChunkBoundaries(500, 4, 1000);
    expect(boundaries).toEqual([{ offset: 0, length: 500 }]);
  });

  it("maxWorkers=1: one big chunk regardless of minChunkSize", () => {
    const boundaries = calculateChunkBoundaries(200, 1, 100);
    expect(boundaries).toHaveLength(1);
  });

  it("evenly divisible length: each chunk is ceil(length/maxWorkers)", () => {
    // length 40 / 4 workers → chunkSize 10 → 4 chunks of 10.
    const boundaries = calculateChunkBoundaries(40, 4, 5);
    expect(boundaries.map((b) => b.length)).toEqual([10, 10, 10, 10]);
    expect(boundaries.map((b) => b.offset)).toEqual([0, 10, 20, 30]);
  });

  it("non-evenly divisible length: last chunk is the short one", () => {
    // length 43 / 4 → ceil(43/4) = 11. Chunks of 11, 11, 11, 10.
    const boundaries = calculateChunkBoundaries(43, 4, 10);
    expect(boundaries.map((b) => b.length)).toEqual([11, 11, 11, 10]);
    expect(boundaries.map((b) => b.offset)).toEqual([0, 11, 22, 33]);
  });

  it("minChunkSize wins when length/maxWorkers would produce smaller chunks", () => {
    const boundaries = calculateChunkBoundaries(100, 10, 50);
    expect(boundaries.map((b) => b.length)).toEqual([50, 50]);
    expect(boundaries.map((b) => b.offset)).toEqual([0, 50]);
  });
});
