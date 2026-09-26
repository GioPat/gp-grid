import { describe, expect, it } from "vitest";
import { SlotPoolManager } from "../src/slot-pool";
import { applyInstruction } from "../src/state-reducer";
import type { RowRegionLayout } from "../src/geometry/row-regions";
import type { GridInstruction } from "../src/types";
import type { AssignSlotInstruction } from "../src/types/instructions";
import type { HeaderData, SlotData } from "../src/types/ui-state";

const ROW_HEIGHT = 32;
const VIEWPORT_HEIGHT = 320;

const layoutOf = (frozenCount: number): RowRegionLayout => ({
  frozenCount,
  frozenExtent: frozenCount * ROW_HEIGHT,
  suffixViewportHeight: Math.max(0, VIEWPORT_HEIGHT - frozenCount * ROW_HEIGHT),
  frozen: { requestedCount: frozenCount, effectiveCount: frozenCount, limit: null },
});

interface HarnessOptions {
  rowCount?: number;
  frozenCount?: number;
  window?: { start: number; end: number };
  /** Rows the source cannot serve yet (a paginated miss). */
  missing?: number[];
}

const createPool = (options: HarnessOptions = {}) => {
  let rowCount = options.rowCount ?? 1000;
  let frozenCount = options.frozenCount ?? 0;
  let window = options.window ?? { start: 0, end: 10 };
  const missing = new Set(options.missing ?? []);

  const state = new Map<string, SlotData>();
  const headers = new Map<string, HeaderData>();
  const batches: GridInstruction[][] = [];

  const pool = new SlotPoolManager({
    getRowWindow: () => window,
    getRowCount: () => rowCount,
    getRowRegions: () => layoutOf(frozenCount),
    getRowOffset: (rowIndex) => rowIndex * ROW_HEIGHT,
    getRowData: (rowIndex) => ({ id: rowIndex }),
    isRowAvailable: (rowIndex) => missing.has(rowIndex) === false,
  });
  // Single emissions arrive here as one-item batches too, so every
  // instruction is applied exactly once.
  pool.onBatchInstruction((instructions) => {
    batches.push(instructions);
    for (const instruction of instructions) applyInstruction(instruction, state, headers);
  });

  const slotsOf = (): SlotData[] => [...state.values()];
  const slotAt = (rowIndex: number): SlotData | undefined =>
    slotsOf().find((slot) => slot.rowIndex === rowIndex);
  const rowsOf = (region: "frozen" | "suffix"): number[] =>
    slotsOf()
      .filter((slot) => slot.region === region)
      .map((slot) => slot.rowIndex)
      .sort((a, b) => a - b);

  return {
    pool,
    state,
    sync: (): GridInstruction[] => {
      pool.syncSlots();
      return batches.at(-1) ?? [];
    },
    refresh: (): GridInstruction[] => {
      const before = batches.length;
      pool.refreshAllSlots();
      return batches[before] ?? [];
    },
    frozenRows: () => rowsOf("frozen"),
    suffixRows: () => rowsOf("suffix"),
    slotAt,
    lastBatch: (): GridInstruction[] => batches.at(-1) ?? [],
    setWindow: (next: { start: number; end: number }) => {
      window = next;
    },
    setFrozenCount: (count: number) => {
      frozenCount = count;
    },
    setRowCount: (count: number) => {
      rowCount = count;
    },
    setMissing: (rows: number[]) => {
      missing.clear();
      for (const row of rows) missing.add(row);
    },
  };
};

const assignFor = (
  instructions: readonly GridInstruction[],
  rowIndex: number,
): AssignSlotInstruction | undefined =>
  instructions.find(
    (instruction): instruction is AssignSlotInstruction =>
      instruction.type === "ASSIGN_SLOT" && instruction.rowIndex === rowIndex,
  );

const destroyedIds = (instructions: readonly GridInstruction[]): string[] =>
  instructions
    .filter((instruction) => instruction.type === "DESTROY_SLOT")
    .map((instruction) => instruction.slotId);

describe("SlotPoolManager — frozen rows (C7)", () => {
  it("mounts the frozen prefix and tags the suffix slots", () => {
    const harness = createPool({ frozenCount: 3, window: { start: 0, end: 10 } });
    const batch = harness.sync();

    expect(harness.frozenRows()).toEqual([0, 1, 2]);
    expect(harness.suffixRows()).toEqual([3, 4, 5, 6, 7, 8, 9]);
    for (const rowIndex of [0, 1, 2]) {
      expect(harness.slotAt(rowIndex)).toMatchObject({ region: "frozen", loading: false });
      expect(assignFor(batch, rowIndex)?.region).toBe("frozen");
    }
    // Suffix slots keep the exact flat payload: the reducer defaults them.
    const suffix = assignFor(batch, 5);
    expect(suffix?.rowData).toEqual({ id: 5 });
    expect(suffix !== undefined && "region" in suffix).toBe(false);
    expect(suffix !== undefined && "loading" in suffix).toBe(false);
  });

  it("keeps the flat payload byte-identical with no regions", () => {
    const harness = createPool({ frozenCount: 0, window: { start: 0, end: 5 } });
    const batch = harness.sync();
    expect(harness.suffixRows()).toEqual([0, 1, 2, 3, 4]);
    expect(harness.frozenRows()).toEqual([]);
    for (const instruction of batch) {
      expect("region" in instruction).toBe(false);
      expect("loading" in instruction).toBe(false);
    }
  });

  it("recycles only suffix slots on a deep vertical scroll", () => {
    const harness = createPool({ rowCount: 100_000, frozenCount: 3, window: { start: 0, end: 10 } });
    harness.sync();
    const frozenBefore = [0, 1, 2].map((rowIndex) => {
      const slot = harness.slotAt(rowIndex)!;
      return { slotId: slot.slotId, rowIndex: slot.rowIndex, translateY: slot.translateY };
    });
    const frozenIds = new Set(frozenBefore.map((slot) => slot.slotId));
    const suffixIds = new Set(harness.suffixRows().map((row) => harness.slotAt(row)!.slotId));

    harness.setWindow({ start: 5000, end: 5010 });
    const batch = harness.sync();

    expect(harness.suffixRows()).toEqual([5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009]);
    expect([0, 1, 2].map((rowIndex) => {
      const slot = harness.slotAt(rowIndex)!;
      return { slotId: slot.slotId, rowIndex: slot.rowIndex, translateY: slot.translateY };
    })).toEqual(frozenBefore);
    const created = new Set(
      batch
        .filter((instruction) => instruction.type === "CREATE_SLOT")
        .map((instruction) => instruction.slotId),
    );
    for (const rowIndex of harness.suffixRows()) {
      const slotId = harness.slotAt(rowIndex)!.slotId;
      expect(suffixIds.has(slotId) || created.has(slotId)).toBe(true);
    }
    expect(destroyedIds(batch).filter((slotId) => frozenIds.has(slotId))).toEqual([]);
    // Seven suffix slots serve ten rows; three are created fresh.
    expect(created.size).toBe(3);
  });

  it("flips a newly frozen row and re-partitions the pools", () => {
    const harness = createPool({ frozenCount: 3, window: { start: 0, end: 10 } });
    harness.sync();
    const frozenBefore = [0, 1, 2].map((rowIndex) => harness.slotAt(rowIndex)!.slotId);
    const flippedId = harness.slotAt(3)!.slotId;

    harness.setFrozenCount(4);
    const batch = harness.sync();

    expect(harness.frozenRows()).toEqual([0, 1, 2, 3]);
    expect(harness.slotAt(3)).toMatchObject({ region: "frozen", loading: false });
    expect(assignFor(batch, 3)?.region).toBe("frozen");
    // The old suffix slot for row 3 cannot serve a frozen row.
    expect(harness.slotAt(3)?.slotId).not.toBe(flippedId);
    expect(harness.state.has(flippedId)).toBe(false);
    expect([0, 1, 2].map((rowIndex) => harness.slotAt(rowIndex)!.slotId)).toEqual(frozenBefore);
  });

  it("gives an unavailable frozen row a placeholder with no cell payload", () => {
    const harness = createPool({
      frozenCount: 3,
      window: { start: 0, end: 6 },
      missing: [1, 5],
    });
    const batch = harness.sync();

    expect(harness.slotAt(1)).toMatchObject({
      region: "frozen",
      loading: true,
      rowData: undefined,
    });
    expect(assignFor(batch, 1)?.loading).toBe(true);
    expect(assignFor(batch, 1)?.rowData).toBeUndefined();
    expect(batch.filter((instruction) => instruction.type === "CREATE_SLOT")).toHaveLength(5);
    // An unavailable suffix row keeps today's behavior: no slot at all.
    expect(harness.slotAt(5)).toBeUndefined();
    expect(harness.suffixRows()).toEqual([3, 4]);
  });

  it("mounts every row and an empty suffix window when everything is frozen", () => {
    const harness = createPool({ rowCount: 5, frozenCount: 5, window: { start: 5, end: 5 } });
    harness.sync();
    expect(harness.frozenRows()).toEqual([0, 1, 2, 3, 4]);
    expect(harness.suffixRows()).toEqual([]);
  });

  it("keeps the frozen prefix when the suffix window is empty", () => {
    const harness = createPool({ frozenCount: 3, window: { start: 0, end: 10 } });
    harness.sync();
    const frozenIds = [0, 1, 2].map((rowIndex) => harness.slotAt(rowIndex)!.slotId);

    harness.setWindow({ start: 3, end: 3 });
    const batch = harness.sync();

    expect([0, 1, 2].map((rowIndex) => harness.slotAt(rowIndex)!.slotId)).toEqual(frozenIds);
    expect(harness.frozenRows()).toEqual([0, 1, 2]);
    expect(harness.suffixRows()).toEqual([]);
    expect(destroyedIds(batch)).toHaveLength(7);
  });

  it("re-emits the region on refresh and drops only rows that left the axis", () => {
    const harness = createPool({ frozenCount: 3, window: { start: 0, end: 6 } });
    harness.sync();
    const frozenSlotId = harness.slotAt(1)!.slotId;

    harness.setMissing([1]);
    const batch = harness.refresh();
    expect(assignFor(batch, 1)?.region).toBe("frozen");
    expect(assignFor(batch, 1)?.loading).toBe(true);
    expect(harness.slotAt(1)).toMatchObject({
      slotId: frozenSlotId,
      region: "frozen",
      loading: true,
      rowData: undefined,
    });

    harness.setRowCount(2);
    harness.refresh();
    expect(harness.frozenRows()).toEqual([0, 1]);
    expect(harness.suffixRows()).toEqual([]);
  });

  it("re-assigns a single frozen row through updateSlot", () => {
    const harness = createPool({ frozenCount: 3, window: { start: 0, end: 6 }, missing: [1] });
    harness.sync();
    harness.setMissing([]);
    harness.pool.updateSlot(1);
    const instructions = harness.lastBatch();
    expect(instructions).toHaveLength(1);
    expect(instructions[0]).toMatchObject({
      type: "ASSIGN_SLOT",
      rowIndex: 1,
      region: "frozen",
      rowData: { id: 1 },
    });
    expect(harness.slotAt(1)).toMatchObject({ region: "frozen", loading: false });
  });
});
