// packages/core/tests/string-collision-resolver.test.ts
// Covers boundary-collision detection and in-place resolveCollisions.
// The boundary math is index-arithmetic-heavy; silent bugs here corrupt
// sort output when parallel sorting hits hash collisions across chunks.

import { describe, it, expect } from "vitest";
import {
  detectBoundaryCollisions,
  resolveCollisions,
} from "../src/sorting/string-collision-resolver";
import type { SortedChunk } from "../src/sorting/k-way-merge";

// Helper — build a SortedChunk. `indices` is local (0..len-1 in input
// order), `values` is the sorted hash array. `offset` is where this chunk
// sits in the merged global order.
const chunk = (indices: number[], values: number[], offset: number): SortedChunk => ({
  indices: new Uint32Array(indices),
  values: new Float64Array(values),
  offset,
});

describe("detectBoundaryCollisions", () => {
  it("single chunk: no boundaries → empty", () => {
    expect(detectBoundaryCollisions([chunk([0, 1, 2], [1, 2, 3], 0)])).toEqual([]);
  });

  it("two chunks, no shared boundary value: empty", () => {
    const a = chunk([0, 1], [1, 2], 0);
    const b = chunk([0, 1], [3, 4], 2);
    expect(detectBoundaryCollisions([a, b])).toEqual([]);
  });

  it("two chunks, one colliding value at the boundary (1 element each side)", () => {
    // Chunk A ends with 5, chunk B starts with 5.
    // Expected collision run spans last of A (global idx 1) to second-of-B (global idx 3).
    const a = chunk([0, 1], [1, 5], 0);
    const b = chunk([0, 1], [5, 7], 2);
    // globalPosition after A = 2. Run = [0 + 1, 0 + 2 + 0 + 1] = [1, 3].
    expect(detectBoundaryCollisions([a, b])).toEqual([1, 3]);
  });

  it("collision run extends several elements backward into the previous chunk", () => {
    // A ends with three trailing 5s. The run should start at A[2] (global 2)
    // and end just past B[0] (global 5 + 1 = 6, exclusive).
    const a = chunk([0, 1, 2, 3, 4], [1, 2, 5, 5, 5], 0);
    const b = chunk([0, 1], [5, 7], 5);
    expect(detectBoundaryCollisions([a, b])).toEqual([2, 6]);
  });

  it("collision run extends several elements forward into the next chunk", () => {
    // A ends with a single 5; B starts with three 5s before a distinct value.
    // Run spans A[1] (global 1) to B[2] (global 2+2+1 = 5 exclusive).
    const a = chunk([0, 1], [3, 5], 0);
    const b = chunk([0, 1, 2, 3], [5, 5, 5, 9], 2);
    expect(detectBoundaryCollisions([a, b])).toEqual([1, 5]);
  });

  it("empty chunk on one side: skipped without contributing a run", () => {
    // B is empty. The early-return branch advances globalPosition and moves on.
    const a = chunk([0, 1], [1, 5], 0);
    const b = chunk([], [], 2);
    expect(detectBoundaryCollisions([a, b])).toEqual([]);

    // A empty on the other side — also skipped cleanly.
    const aEmpty = chunk([], [], 0);
    const c = chunk([0, 1], [5, 7], 0);
    expect(detectBoundaryCollisions([aEmpty, c])).toEqual([]);
  });

  it("three chunks with two separate boundary collisions", () => {
    // A|B collide on 5; B|C collide on 7.
    // Expected: first pair (1, 3) from the A|B boundary, second pair (3, 5)
    // from the B|C boundary (globalPosition has advanced to 2 by then).
    const a = chunk([0, 1], [1, 5], 0);
    const b = chunk([0, 1], [5, 7], 2);
    const c = chunk([0, 1], [7, 9], 4);
    expect(detectBoundaryCollisions([a, b, c])).toEqual([1, 3, 3, 5]);
  });
});

describe("resolveCollisions", () => {
  const strings = ["zzz", "aaa", "mmm", "bbb"]; // original string at each global index

  it("reorders a collision run by localeCompare (asc)", () => {
    // Suppose hashes collided for all 4 indices; resolver must sort them
    // into alphabetical order: aaa, bbb, mmm, zzz → indices [1, 3, 2, 0].
    const indices = new Uint32Array([0, 1, 2, 3]);
    resolveCollisions(indices, new Uint32Array([0, 4]), strings, "asc");
    expect(Array.from(indices)).toEqual([1, 3, 2, 0]);
  });

  it("reorders a collision run by localeCompare (desc)", () => {
    // Reverse alphabetical: zzz, mmm, bbb, aaa → indices [0, 2, 3, 1].
    const indices = new Uint32Array([0, 1, 2, 3]);
    resolveCollisions(indices, new Uint32Array([0, 4]), strings, "desc");
    expect(Array.from(indices)).toEqual([0, 2, 3, 1]);
  });

  it("all-identical run: short-circuits (no mutation, order preserved)", () => {
    const indices = new Uint32Array([2, 0, 1]);
    const ss = ["same", "same", "same"];
    resolveCollisions(indices, new Uint32Array([0, 3]), ss, "asc");
    expect(Array.from(indices)).toEqual([2, 0, 1]); // unchanged
  });

  it("skips invalid runs (end <= start, end > indices.length)", () => {
    // Only invalid runs: indices stay untouched.
    const indicesA = new Uint32Array([3, 2, 1, 0]);
    resolveCollisions(
      indicesA,
      new Uint32Array([5, 3, 0, 100]), // end<=start, then end>length
      ["a", "b", "c", "d"],
      "asc",
    );
    expect(Array.from(indicesA)).toEqual([3, 2, 1, 0]);

    // Mixed: one invalid run is skipped, a valid run applies after it.
    // Strings chosen so the valid run produces a different order than input.
    const indicesB = new Uint32Array([0, 1, 2, 3]);
    resolveCollisions(
      indicesB,
      new Uint32Array([5, 3, 0, 4]), // first invalid, second valid
      ["z", "a", "m", "b"],
      "asc",
    );
    expect(Array.from(indicesB)).toEqual([1, 3, 2, 0]);
  });

  it("multiple runs in one call: each sorted independently", () => {
    // 6-element index array, two disjoint runs [0, 3) and [3, 6).
    const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const ss = ["z", "a", "m", "b", "y", "c"];
    // Run [0, 3): sorts "z","a","m" → "a","m","z" → indices [1, 2, 0]
    // Run [3, 6): sorts "b","y","c" → "b","c","y" → indices [3, 5, 4]
    resolveCollisions(indices, new Uint32Array([0, 3, 3, 6]), ss, "asc");
    expect(Array.from(indices)).toEqual([1, 2, 0, 3, 5, 4]);
  });
});
