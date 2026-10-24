import { describe, expect, it } from "vitest";
import { SlotPoolManager } from "../src/slot-pool";
import { applyInstruction } from "../src/state-reducer";
import type { RowRegionLayout } from "../src/geometry/row-regions";
import type { GridInstruction, HierarchyRow } from "../src/types";
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
  /** Hierarchy rows by index; omitted while flat. */
  getRow?: (rowIndex: number) => HierarchyRow | undefined;
}

const createPool = (options: HarnessOptions = {}) => {
  let rowCount = options.rowCount ?? 1000;
  let frozenCount = options.frozenCount ?? 0;
  let window = options.window ?? { start: 0, end: 10 };
  const missing = new Set(options.missing ?? []);

  const state = new Map<string, SlotData>();
  const headers = new Map<string, HeaderData>();
  const batches: GridInstruction[][] = [];
  const sizes = new Map<number, number>();

  const pool = new SlotPoolManager({
    getRowWindow: () => window,
    getRowCount: () => rowCount,
    getRowRegions: () => layoutOf(frozenCount),
    getRowOffset: (rowIndex) => {
      let offset = 0;
      for (let index = 0; index < rowIndex; index += 1) {
        offset += sizes.get(index) ?? ROW_HEIGHT;
      }
      return offset;
    },
    getRowSize: (rowIndex) => sizes.get(rowIndex) ?? ROW_HEIGHT,
    getRowData: (rowIndex) => ({ id: rowIndex }),
    isRowAvailable: (rowIndex) => missing.has(rowIndex) === false,
    getRow: options.getRow,
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
    setRowSize: (rowIndex: number, size: number) => {
      sizes.set(rowIndex, size);
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

describe("SlotPoolManager — published row heights (D8)", () => {
  const movesOf = (instructions: readonly GridInstruction[]) =>
    instructions.filter((instruction) => instruction.type === "MOVE_SLOT");

  it("carries the axis height on assignment and on refresh", () => {
    const harness = createPool({ window: { start: 0, end: 3 } });
    harness.setRowSize(1, 96);

    const batch = harness.sync();
    expect(movesOf(batch)).toEqual([
      { type: "MOVE_SLOT", slotId: "slot-0", translateY: 0, height: ROW_HEIGHT },
      { type: "MOVE_SLOT", slotId: "slot-1", translateY: ROW_HEIGHT, height: 96 },
      { type: "MOVE_SLOT", slotId: "slot-2", translateY: ROW_HEIGHT + 96, height: ROW_HEIGHT },
    ]);
    expect(harness.slotAt(1)?.height).toBe(96);

    const refreshed = harness.refresh();
    const heights = refreshed
      .filter((instruction) => instruction.type === "MOVE_SLOT")
      .map((instruction) => instruction.height);
    expect(heights).toEqual([ROW_HEIGHT, 96, ROW_HEIGHT]);
  });

  it("emits MOVE_SLOT for a height-only change", () => {
    const harness = createPool({ window: { start: 0, end: 3 } });
    harness.sync();

    harness.setRowSize(2, 64);
    const batch = harness.sync();

    const moved = movesOf(batch).filter(
      (instruction) => "height" in instruction && instruction.height === 64,
    );
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({
      slotId: harness.slotAt(2)?.slotId,
      translateY: 2 * ROW_HEIGHT,
      height: 64,
    });
    expect(harness.slotAt(2)?.height).toBe(64);
  });
});

describe("SlotPoolManager — hierarchy rows (D10)", () => {
  const rowOf = (rowIndex: number): HierarchyRow =>
    rowIndex === 0
      ? { kind: "total", id: "total", depth: 0, leafCount: 4 }
      : { kind: "record", id: `r${rowIndex}`, depth: 1 };

  it("publishes the row on assignment, refresh and single update", () => {
    const harness = createPool({ window: { start: 0, end: 3 }, getRow: rowOf });
    const batch = harness.sync();
    expect(assignFor(batch, 0)?.row).toEqual(rowOf(0));
    expect(harness.slotAt(1)?.row).toEqual(rowOf(1));

    expect(assignFor(harness.refresh(), 2)?.row).toEqual(rowOf(2));
    harness.pool.updateSlot(1);
    expect(assignFor(harness.lastBatch(), 1)?.row).toEqual(rowOf(1));
  });

  it("emits no row field while flat", () => {
    const harness = createPool({ window: { start: 0, end: 3 }, getRow: () => undefined });
    for (const instruction of [...harness.sync(), ...harness.refresh()]) {
      expect("row" in instruction).toBe(false);
    }
    expect(harness.slotAt(0) !== undefined && "row" in harness.slotAt(0)!).toBe(false);
  });
});
