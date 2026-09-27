import { describe, expect, it } from "vitest";
import { PendingScrollLatch } from "../src/adapter/pending-scroll";

describe("PendingScrollLatch", () => {
  it("keeps a correction through a later batch without SCROLL_TO", () => {
    const latch = new PendingScrollLatch();
    latch.collect([{ type: "SCROLL_TO", scrollTop: 0, scrollLeft: 120 }]);
    // Batches coalesced into one render must not erase the correction.
    latch.collect([{ type: "SET_ACTIVE_CELL", position: null }]);
    expect(latch.take()).toEqual({ top: 0, left: 120 });
  });

  it("overwrites only the axes a later SCROLL_TO names", () => {
    const latch = new PendingScrollLatch();
    latch.collect([{ type: "SCROLL_TO", scrollTop: 40 }]);
    latch.collect([{ type: "SCROLL_TO", scrollLeft: 120 }]);
    latch.collect([{ type: "SCROLL_TO", scrollTop: 64 }]);
    expect(latch.take()).toEqual({ top: 64, left: 120 });
  });

  it("hands each correction out once, and a repeated value again", () => {
    const latch = new PendingScrollLatch();
    latch.collect([{ type: "SCROLL_TO", scrollTop: 40 }]);
    expect(latch.take()).toEqual({ top: 40, left: null });
    expect(latch.take()).toBeNull();

    latch.collect([{ type: "SCROLL_TO", scrollTop: 40 }]);
    expect(latch.take()).toEqual({ top: 40, left: null });
  });

  it("drops the correction on clear", () => {
    const latch = new PendingScrollLatch();
    latch.collect([{ type: "SCROLL_TO", scrollTop: 40 }]);
    latch.clear();
    expect(latch.take()).toBeNull();
  });
});
