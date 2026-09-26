// packages/core/src/slot-pool-plan.ts
// C7 slot planning: the frozen prefix plus the overscanned suffix window
// become create/assign/move/destroy instructions. Pure over injected
// accessors and the pool's own maps, which it mutates in place.

import type { GridInstruction, SlotState } from "./types";
import type { RowRegion } from "./types/geometry";
import type { RowRegionLayout } from "./geometry";

export interface SlotPlanInput {
  slots: Map<string, SlotState>;
  rowToSlot: Map<number, string>;
  /** New slot identity; the manager owns the sequence. */
  nextSlotId: () => string;
  /** New assignment generation; the manager owns the sequence. */
  nextGeneration: () => number;
  /** Overscanned half-open suffix row window. */
  window: { start: number; end: number };
  rowCount: number;
  regions: RowRegionLayout;
  isRowAvailable: (rowIndex: number) => boolean;
  getRowData: (rowIndex: number) => unknown;
  getRowOffset: (rowIndex: number) => number;
}

/** Recycle candidates by stored region, plus slots that left the axis. */
interface SlotPools {
  suffix: string[];
  frozen: string[];
  dead: string[];
}

interface PoolCursors {
  suffix: number;
  frozen: number;
  dead: number;
}

const regionOfRow = (rowIndex: number, regions: RowRegionLayout): RowRegion =>
  rowIndex < regions.frozenCount ? "frozen" : "suffix";

/** Only the non-default fields: the flat instruction payload stays exact. */
const slotRegionFields = (region: RowRegion, loading: boolean) => {
  const fields: { region?: RowRegion; loading?: boolean } = {};
  if (region === "frozen") fields.region = region;
  if (loading) fields.loading = loading;
  return fields;
};

const takeRecycled = (
  pools: SlotPools,
  cursors: PoolCursors,
  region: RowRegion,
): string | undefined => {
  const own: keyof SlotPools = region === "frozen" ? "frozen" : "suffix";
  const ownId = pools[own][cursors[own]];
  if (ownId !== undefined) {
    cursors[own] += 1;
    return ownId;
  }
  const deadId = pools.dead[cursors.dead];
  if (deadId !== undefined) cursors.dead += 1;
  return deadId;
};

const leftoverSlots = (pools: SlotPools, cursors: PoolCursors): string[] => [
  ...pools.suffix.slice(cursors.suffix),
  ...pools.frozen.slice(cursors.frozen),
  ...pools.dead.slice(cursors.dead),
];

/** Frozen prefix plus the overscanned suffix window, ascending (C7). */
const requiredRows = (input: SlotPlanInput): Set<number> => {
  const { window, rowCount, regions } = input;
  const frozenCount = Math.min(Math.max(regions.frozenCount, 0), rowCount);
  const rows = new Set<number>();
  for (let row = 0; row < frozenCount; row++) {
    rows.add(row);
  }
  for (let row = Math.max(window.start, frozenCount); row < window.end && row < rowCount; row++) {
    rows.add(row);
  }
  return rows;
};

/** A mounted slot stays while its row is required and its region matches. */
const isSlotCurrent = (input: SlotPlanInput, slot: SlotState): boolean => {
  const region = regionOfRow(slot.rowIndex, input.regions);
  if (slot.region !== region) return false;
  if (region === "suffix") return true;
  const loading = input.isRowAvailable(slot.rowIndex) === false;
  return slot.loading === loading;
};

/** Frozen slots never recycle into suffix rows or the reverse (C7). */
const poolOf = (input: SlotPlanInput, slot: SlotState): keyof SlotPools => {
  const leftAxis = slot.rowIndex >= input.rowCount;
  const leftPrefix = slot.region === "frozen" && slot.rowIndex >= input.regions.frozenCount;
  if (leftAxis || leftPrefix) return "dead";
  return slot.region === "frozen" ? "frozen" : "suffix";
};

/**
 * Partition mounted slots into recycle pools, removing the rows that are
 * already mounted with the right region. Mutates `required`.
 */
const partitionSlots = (input: SlotPlanInput, required: Set<number>): SlotPools => {
  const pools: SlotPools = { suffix: [], frozen: [], dead: [] };
  for (const [slotId, slot] of input.slots) {
    if (required.has(slot.rowIndex) && isSlotCurrent(input, slot)) {
      required.delete(slot.rowIndex);
      continue;
    }
    input.rowToSlot.delete(slot.rowIndex);
    pools[poolOf(input, slot)].push(slotId);
  }
  return pools;
};

/** Assign a row to a recycled or newly created slot. */
const assignSlot = (
  input: SlotPlanInput,
  rowIndex: number,
  region: RowRegion,
  rowData: unknown,
  loading: boolean,
  recycledSlotId: string | undefined,
  instructions: GridInstruction[],
): void => {
  const generation = input.nextGeneration();
  const translateY = input.getRowOffset(rowIndex);
  let slotId: string;

  if (recycledSlotId === undefined) {
    slotId = input.nextSlotId();
    input.slots.set(slotId, {
      slotId,
      rowIndex,
      rowData,
      generation,
      translateY,
      region,
      loading,
    });
    instructions.push({
      type: "CREATE_SLOT",
      slotId,
      generation,
      ...slotRegionFields(region, loading),
    });
  } else {
    slotId = recycledSlotId;
    const slot = input.slots.get(slotId)!;
    slot.rowIndex = rowIndex;
    slot.rowData = rowData;
    slot.generation = generation;
    slot.translateY = translateY;
    slot.region = region;
    slot.loading = loading;
  }

  input.rowToSlot.set(rowIndex, slotId);
  instructions.push(
    {
      type: "ASSIGN_SLOT",
      slotId,
      rowIndex,
      rowData,
      generation,
      ...slotRegionFields(region, loading),
    },
    { type: "MOVE_SLOT", slotId, translateY },
  );
};

/** Push MOVE_SLOT instructions for slots whose position has drifted. */
const updateSlotPositions = (input: SlotPlanInput, instructions: GridInstruction[]): void => {
  for (const [slotId, slot] of input.slots) {
    const expectedY = input.getRowOffset(slot.rowIndex);
    if (slot.translateY !== expectedY) {
      slot.translateY = expectedY;
      instructions.push({ type: "MOVE_SLOT", slotId, translateY: expectedY });
    }
  }
};

/** Mount the frozen prefix and the suffix window, recycling what it can. */
export const planSlotSync = (input: SlotPlanInput): GridInstruction[] => {
  const required = requiredRows(input);
  const pools = partitionSlots(input, required);
  const cursors: PoolCursors = { suffix: 0, frozen: 0, dead: 0 };
  const instructions: GridInstruction[] = [];

  for (const rowIndex of required) {
    const region = regionOfRow(rowIndex, input.regions);
    const available = input.isRowAvailable(rowIndex);
    // An unavailable suffix row keeps no slot: the grid overlay covers it.
    if (region === "suffix" && available === false) continue;
    const rowData = available ? input.getRowData(rowIndex) : undefined;
    assignSlot(
      input,
      rowIndex,
      region,
      rowData,
      available === false,
      takeRecycled(pools, cursors, region),
      instructions,
    );
  }

  for (const slotId of leftoverSlots(pools, cursors)) {
    input.slots.delete(slotId);
    instructions.push({ type: "DESTROY_SLOT", slotId });
  }

  updateSlotPositions(input, instructions);

  return instructions;
};

/** Re-assign every mounted row after its data changed. */
export const planSlotRefresh = (input: SlotPlanInput): GridInstruction[] => {
  const instructions: GridInstruction[] = [];

  for (const [slotId, slot] of input.slots) {
    // Rows that left the axis are dropped by the following sync.
    if (slot.rowIndex < 0 || slot.rowIndex >= input.rowCount) continue;
    const region = regionOfRow(slot.rowIndex, input.regions);
    const available = input.isRowAvailable(slot.rowIndex);
    if (region === "suffix" && available === false) continue;
    const rowData = available ? input.getRowData(slot.rowIndex) : undefined;
    const loading = available === false;

    const translateY = input.getRowOffset(slot.rowIndex);
    const generation = input.nextGeneration();

    slot.rowData = rowData;
    slot.loading = loading;
    slot.region = region;
    slot.generation = generation;
    slot.translateY = translateY;

    instructions.push(
      {
        type: "ASSIGN_SLOT",
        slotId,
        rowIndex: slot.rowIndex,
        rowData,
        generation,
        ...slotRegionFields(region, loading),
      },
      { type: "MOVE_SLOT", slotId, translateY },
    );
  }

  return instructions;
};

/** Re-assign a single mounted row; an empty result means nothing to update. */
export const planSlotUpdate = (input: SlotPlanInput, rowIndex: number): GridInstruction[] => {
  const slotId = input.rowToSlot.get(rowIndex);
  if (slotId === undefined) return [];
  const region = regionOfRow(rowIndex, input.regions);
  const available = input.isRowAvailable(rowIndex);
  if (region === "suffix" && available === false) return [];
  const loading = available === false;

  const slot = input.slots.get(slotId);
  const generation = input.nextGeneration();
  if (slot) {
    slot.generation = generation;
    slot.region = region;
    slot.loading = loading;
  }
  return [
    {
      type: "ASSIGN_SLOT",
      slotId,
      rowIndex,
      rowData: available ? input.getRowData(rowIndex) : undefined,
      generation,
      ...slotRegionFields(region, loading),
    },
  ];
};
