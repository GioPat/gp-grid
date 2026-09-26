import { describe, expect, it } from "vitest";
import {
  admitOptionalPages,
  evictionCandidates,
  resolvePrefixReservations,
} from "../src/managers/page-reservation";

describe("page admission and reservations", () => {
  it("admits optional pages nearest-first and never fills the gap", () => {
    const required = [10, 11];
    expect(admitOptionalPages({
      required,
      loaded: required,
      reserved: [],
      maxPages: 4,
      overscan: [12, 9],
      prefetch: [8, 13],
    })).toEqual([9, 12]);
    expect(admitOptionalPages({ required, loaded: required, reserved: [], maxPages: 3, overscan: [9, 12] }))
      .toEqual([9]);
    expect(admitOptionalPages({
      required: [0, 20],
      loaded: [0, 20],
      reserved: [],
      maxPages: 6,
      overscan: [5, 19],
      prefetch: [21],
      gap: { start: 1, end: 20 },
    })).toEqual([21]);
    expect(admitOptionalPages({
      required: [0, 8999, 9000],
      loaded: [],
      reserved: [],
      maxPages: 3,
      overscan: [1],
    })).toEqual([]);
    expect(admitOptionalPages({
      required,
      loaded: required,
      reserved: [12],
      maxPages: 4,
      overscan: [9, 13],
    })).toEqual([9]);
  });

  it("admits prefetch pages when there is no overscan", () => {
    expect(admitOptionalPages({ required: [4], loaded: [4], reserved: [], maxPages: 3, prefetch: [6, 5] }))
      .toEqual([5, 6]);
  });

  it("filters eviction candidates away from protected blocks", () => {
    expect(evictionCandidates({ loaded: [0, 1, 2, 3], protectedBlocks: [0, 8999, 9000], center: 9000 }))
      .toEqual([1, 2, 3]);
    expect(evictionCandidates({ loaded: [0, 1], protectedBlocks: [0, 1], center: 0 })).toEqual([]);
    expect(evictionCandidates({ loaded: [5, 4, 6], protectedBlocks: [5, 6], center: 5 })).toEqual([4]);
  });

  it("keeps load order between equidistant eviction candidates", () => {
    expect(evictionCandidates({ loaded: [3, 0, 2], protectedBlocks: [], center: 1 })).toEqual([3, 0, 2]);
  });

  it("never evicts visible suffix or reserved prefix pages", () => {
    const required = [0, 8999, 9000];
    const reserved = resolvePrefixReservations([], 2, 100);
    const protectedBlocks = [...required, ...reserved.pages];
    const candidates = evictionCandidates({ loaded: [...required, 8998, 1], protectedBlocks, center: 9000 });
    expect(candidates).toEqual([1, 8998]);
    for (const block of candidates) {
      expect(protectedBlocks).not.toContain(block);
    }
  });

  it("keeps loaded plus reserved capacity through replacement sequences", () => {
    const required = [0, 8999, 9000];
    const loaded = new Set<number>();
    const reserved = new Set<number>();
    expect(admitOptionalPages({
      required,
      loaded: [...loaded],
      reserved: [...reserved],
      maxPages: 3,
      overscan: [8998],
    })).toEqual([]);
    for (const block of required) loaded.add(block);
    expect(admitOptionalPages({
      required,
      loaded: [...loaded],
      reserved: [...reserved],
      maxPages: 4,
      overscan: [8998],
    })).toEqual([8998]);
    reserved.add(8998);
    expect(admitOptionalPages({
      required,
      loaded: [...loaded],
      reserved: [...reserved],
      maxPages: 4,
      overscan: [8998],
    })).toEqual([]);
    loaded.add(8998);
    reserved.delete(8998);
    loaded.add(1);
    loaded.add(2);
    const evicted = evictionCandidates({
      loaded: [...loaded],
      protectedBlocks: [...required, 8998],
      center: 9000,
    });
    expect(evicted).toEqual([1, 2]);
    for (const block of evicted) loaded.delete(block);
    expect(new Set([...loaded, ...reserved]).size).toBeLessThanOrEqual(4);
  });

  it("keeps and releases prefix reservations", () => {
    const first = resolvePrefixReservations([], 250, 100);
    expect(first).toEqual({ pages: [0, 1, 2], released: [] });
    expect(resolvePrefixReservations(first.pages, 250, 100)).toEqual({ pages: [0, 1, 2], released: [] });
    expect(resolvePrefixReservations(first.pages, 150, 100)).toEqual({ pages: [0, 1], released: [2] });
    expect(resolvePrefixReservations([], 200, 100)).toEqual({ pages: [0, 1], released: [] });
    expect(resolvePrefixReservations([0, 1, 2, 3], 200, 100)).toEqual({ pages: [0, 1], released: [2, 3] });
    expect(resolvePrefixReservations([0, 1], 250, 100)).toEqual({ pages: [0, 1, 2], released: [] });
    expect(resolvePrefixReservations([0, 1, 2], 0, 100)).toEqual({ pages: [], released: [0, 1, 2] });
    expect(resolvePrefixReservations([], 0, 100)).toEqual({ pages: [], released: [] });
  });
});
