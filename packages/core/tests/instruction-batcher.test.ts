import { describe, expect, it } from "vitest";
import { InstructionBatcher } from "../src/managers/instruction-batcher";
import type { GridInstruction } from "../src/types";

const loading: GridInstruction = { type: "DATA_LOADING" };
const scrollTo: GridInstruction = { type: "SCROLL_TO", scrollTop: 0 };

const collectBatches = (batcher: InstructionBatcher): GridInstruction[][] => {
  const batches: GridInstruction[][] = [];
  batcher.subscribe((instructions) => batches.push(instructions));
  return batches;
};

describe("InstructionBatcher", () => {
  it("delivers each instruction on its own when not buffering", () => {
    const batcher = new InstructionBatcher();
    const batches = collectBatches(batcher);

    batcher.emit(loading);
    batcher.emit(scrollTo);

    expect(batches).toEqual([[loading], [scrollTo]]);
  });

  it("delivers one batch per start/flush pair", () => {
    const batcher = new InstructionBatcher();
    const batches = collectBatches(batcher);

    batcher.start();
    batcher.emit(loading);
    batcher.emitBatch([scrollTo, scrollTo]);
    batcher.flush();

    expect(batches).toEqual([[loading, scrollTo, scrollTo]]);
  });

  it("delivers a single batch when start/flush pairs nest", () => {
    const batcher = new InstructionBatcher();
    const batches = collectBatches(batcher);

    batcher.start();
    batcher.emit(scrollTo);
    batcher.start();
    batcher.emit(loading);
    batcher.flush();
    // The inner flush must neither deliver nor drop what the outer batch holds.
    expect(batches).toEqual([]);
    batcher.emit(scrollTo);
    batcher.flush();

    expect(batches).toEqual([[scrollTo, loading, scrollTo]]);
  });

  it("ignores a flush without a matching start", () => {
    const batcher = new InstructionBatcher();
    const batches = collectBatches(batcher);

    batcher.flush();
    batcher.emit(loading);

    expect(batches).toEqual([[loading]]);
  });

  it("delivers nothing for an empty batch", () => {
    const batcher = new InstructionBatcher();
    const batches = collectBatches(batcher);

    batcher.start();
    batcher.flush();

    expect(batches).toEqual([]);
  });
});
