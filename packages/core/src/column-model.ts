// packages/core/src/column-model.ts
// Owns the three column layers: immutable caller definitions, live column
// state keyed by ColumnId, and the resolved layout everything else reads.

import { isUsableWidth, normalizeColumnWidth } from "./geometry/column-widths";
import {
  baseIndexOfLayout,
  clampIndexToRegion,
  flattenPartition,
  partitionByPin,
  type ColumnPartition,
} from "./geometry/column-order";
import type {
  ColumnDefinition,
  ColumnId,
  ColumnModelState,
  ColumnPin,
  ColumnState,
  ColumnStateUpdate,
} from "./types";

/** Resolved-layout membership change produced by `setDefinitions`. */
export interface ColumnModelDiff {
  added: ColumnId[];
  removed: ColumnId[];
}

/** Which layout dimensions a state command changed. */
export interface ColumnModelChange {
  orderChanged: boolean;
  widthChanged: boolean;
  hiddenChanged: boolean;
  pinChanged: boolean;
}

/** Applied move: the target layout index plus the adopted pin, if any. */
export interface ColumnMoveResult {
  toIndex: number;
  pinned: ColumnPin | null;
  pinChanged: boolean;
}

const NO_CHANGE: ColumnModelChange = {
  orderChanged: false,
  widthChanged: false,
  hiddenChanged: false,
  pinChanged: false,
};

/** Normalized identity of a definition: `colId ?? field`. */
export const getColumnId = (definition: ColumnDefinition): ColumnId =>
  definition.colId ?? definition.field;

/** Whether two resolved layouts render the same columns with the same state. */
const isSameColumnList = (
  a: readonly ColumnDefinition[],
  b: readonly ColumnDefinition[],
): boolean => {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) {
    const before = a[index]!;
    const after = b[index]!;
    if (getColumnId(before) !== getColumnId(after)) return false;
    if (before !== after) return false;
    if (before.width !== after.width) return false;
    if ((before.hidden ?? false) !== (after.hidden ?? false)) return false;
    if ((before.pinned ?? null) !== (after.pinned ?? null)) return false;
  }
  return true;
};

const isValidIndex = (index: number, length: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < length;

const warnDuplicateOnce = (id: ColumnId, warned: Set<ColumnId>): void => {
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(`[gp-grid] Duplicate column id "${id}"`);
};

/**
 * Drop duplicate IDs and diagnose each one once. The first definition for an
 * ID wins; later definitions never share its state or appear in the layout.
 */
const normalizeDefinitions = (
  definitions: readonly ColumnDefinition[],
  warned: Set<ColumnId>,
): ColumnDefinition[] => {
  const seen = new Set<ColumnId>();
  const duplicated = new Set<ColumnId>();
  const unique: ColumnDefinition[] = [];
  for (const definition of definitions) {
    const id = getColumnId(definition);
    if (seen.has(id)) {
      duplicated.add(id);
      warnDuplicateOnce(id, warned);
      continue;
    }
    seen.add(id);
    unique.push(definition);
  }
  // A duplicate that was fixed and later comes back is diagnosed again.
  for (const id of warned) {
    if (duplicated.has(id) === false) warned.delete(id);
  }
  return unique;
};

export class ColumnModel {
  private definitions: ColumnDefinition[] = [];
  private readonly definitionsById = new Map<ColumnId, ColumnDefinition>();
  private readonly overrides = new Map<ColumnId, ColumnState>();
  /** Base order: the model's authoritative id sequence, independent of pins. */
  private orderIds: ColumnId[] = [];
  /** `orderIds` partitioned by requested pin; the index space of the layout. */
  private layoutIds: ColumnId[] = [];
  private partition: ColumnPartition = { start: [], center: [], end: [] };
  private readonly pins = new Map<ColumnId, ColumnPin | null>();
  private idSet: ReadonlySet<ColumnId> = new Set();
  /** IDs whose position came from an explicit user move, not definition order. */
  private readonly orderOverridden = new Set<ColumnId>();
  private layout: ColumnDefinition[] = [];
  private readonly warnedDuplicateIds = new Set<ColumnId>();
  /** Column ids currently carrying an invalid width that was diagnosed. */
  private readonly warnedInvalidWidths = new Set<ColumnId>();
  /** Width-override membership captured before the current state command. */
  private overriddenBefore: ReadonlySet<ColumnId> = new Set();

  constructor(definitions: readonly ColumnDefinition[] = []) {
    this.setDefinitions(definitions);
  }

  /**
   * Replace caller definitions. Retained IDs keep their state and relative
   * order; removed IDs drop both; new IDs take definition defaults. When no
   * column has been explicitly moved, the definition order is authoritative.
   */
  setDefinitions(definitions: readonly ColumnDefinition[]): ColumnModelDiff {
    const unique = normalizeDefinitions(definitions, this.warnedDuplicateIds);
    const previousIds = this.orderIds;
    const previousSet = new Set(previousIds);
    const nextIds = unique.map(getColumnId);
    const nextSet = new Set(nextIds);

    const retained = previousIds.filter((id) => nextSet.has(id));
    const added = nextIds.filter((id) => previousSet.has(id) === false);
    const removed = previousIds.filter((id) => nextSet.has(id) === false);

    for (const id of removed) {
      this.overrides.delete(id);
      this.orderOverridden.delete(id);
      this.pins.delete(id);
    }

    this.definitions = unique;
    this.definitionsById.clear();
    for (const definition of unique) {
      this.definitionsById.set(getColumnId(definition), definition);
    }
    this.idSet = nextSet;
    if (this.orderOverridden.size === 0) {
      this.orderIds = nextIds;
    } else {
      for (const id of added) {
        const position = nextIds.indexOf(id);
        const anchor = this.nextRetainedAfter(nextIds, position, previousSet);
        const insertAt = anchor === undefined ? retained.length : retained.indexOf(anchor);
        retained.splice(insertAt, 0, id);
      }
      this.orderIds = retained;
    }
    this.resolve();
    return { added, removed };
  }

  /** Apply explicit state commands; they win over retained state. */
  setState(updates: readonly ColumnStateUpdate[]): ColumnModelChange {
    const beforeOrder = [...this.orderIds];
    const beforeLayout = this.layout;
    this.overriddenBefore = this.currentOverrides();
    for (const update of updates) {
      if (this.has(update.columnId) === false) continue;
      // A pin is not an order override: the base order stays authoritative so
      // unpin and reset return the column to its base slot.
      if (update.pinned !== undefined) this.pins.set(update.columnId, update.pinned);
    }
    for (const update of updates) {
      if (this.has(update.columnId) === false) continue;
      if (update.width === undefined && update.hidden === undefined) continue;
      const state = this.overrides.get(update.columnId) ?? {};
      if (update.width !== undefined) state.width = this.diagnoseWidth(update.columnId, update.width);
      if (update.hidden !== undefined) state.hidden = update.hidden;
      this.overrides.set(update.columnId, state);
    }
    for (const update of updates) {
      if (update.order === undefined || this.has(update.columnId) === false) continue;
      // Pins applied above must be visible to `clampIndexToRegion`, so the
      // partition is refreshed before the order command is clamped.
      this.repartition();
      this.moveToIndex(update.columnId, update.order);
    }
    this.resolve();
    return this.diffSince(beforeOrder, beforeLayout);
  }

  /**
   * Drop user state. With no IDs, every column returns to its definition
   * defaults and order. With IDs, those columns return to their definition
   * position relative to the retained order.
   */
  resetState(columnIds?: readonly ColumnId[]): ColumnModelChange {
    const beforeOrder = [...this.orderIds];
    const beforeLayout = this.layout;
    this.overriddenBefore = this.currentOverrides();
    if (columnIds === undefined) {
      this.overrides.clear();
      this.orderOverridden.clear();
      this.pins.clear();
      this.orderIds = this.definitionIds();
      this.resolve();
      return this.diffSince(beforeOrder, beforeLayout);
    }

    const resetSet = new Set(columnIds);
    for (const id of columnIds) {
      this.overrides.delete(id);
      this.orderOverridden.delete(id);
      this.pins.delete(id);
    }

    const retained = this.orderIds.filter((id) => resetSet.has(id) === false);
    const definitionIds = this.definitionIds();
    const added = definitionIds.filter((id) => resetSet.has(id));
    for (const id of added) {
      const position = definitionIds.indexOf(id);
      const anchor = this.nextRetainedAfter(definitionIds, position, new Set(retained));
      const insertAt = anchor === undefined ? retained.length : retained.indexOf(anchor);
      retained.splice(insertAt, 0, id);
    }
    this.orderIds = retained;
    this.resolve();
    return this.diffSince(beforeOrder, beforeLayout);
  }

  /** Resolved layout: ordered caller definitions with effective width/hidden. */
  getLayout(): ColumnDefinition[] {
    return this.layout;
  }

  /** Width-override, visibility and pin state, in layout order. */
  getState(): ColumnModelState[] {
    return this.layout.map((column, order) => {
      const columnId = getColumnId(column);
      const state: ColumnModelState = {
        columnId,
        hidden: column.hidden ?? false,
        order,
        pinned: column.pinned ?? null,
      };
      if (this.isWidthOverridden(columnId)) state.width = column.width;
      return state;
    });
  }

  /** Effective requested pin for a column; `null` when it is unpinned. */
  getPin(columnId: ColumnId): ColumnPin | null {
    if (this.pins.has(columnId)) return this.pins.get(columnId)!;
    return this.definitionsById.get(columnId)?.pinned ?? null;
  }

  /** Caller definitions by id, for reset-defaults decisions. */
  getDefinitions(): ReadonlyMap<ColumnId, ColumnDefinition> {
    return this.definitionsById;
  }

  ids(): ColumnId[] {
    return [...this.layoutIds];
  }

  has(columnId: ColumnId): boolean {
    return this.idSet.has(columnId);
  }

  indexOf(columnId: ColumnId): number {
    return this.layoutIds.indexOf(columnId);
  }

  idAt(index: number): ColumnId | undefined {
    return this.layoutIds[index];
  }

  columnAt(index: number): ColumnDefinition | undefined {
    return this.layout[index];
  }

  setWidth(columnId: ColumnId, width: number): void {
    if (this.has(columnId) === false) return;
    const state = this.overrides.get(columnId) ?? {};
    state.width = this.diagnoseWidth(columnId, width);
    this.overrides.set(columnId, state);
    this.resolve();
  }

  /**
   * Set (or clear) a column's requested pin. Repartitions and re-resolves;
   * the base order is untouched, so unpinning returns the column to its
   * base-order slot.
   */
  setPinned(columnId: ColumnId, pinned: ColumnPin | null): boolean {
    if (this.has(columnId) === false) return false;
    if (this.getPin(columnId) === pinned) return false;
    this.pins.set(columnId, pinned);
    // The base order is unchanged: unpinning and reset both return the
    // column to the slot it still holds in `orderIds`.
    this.resolve();
    return true;
  }

  private currentOverrides(): ReadonlySet<ColumnId> {
    const ids = new Set<ColumnId>();
    for (const [columnId, state] of this.overrides) {
      if (state.width !== undefined) ids.add(columnId);
    }
    return ids;
  }

  /** Whether the column carries an explicit pixel width override. */
  isWidthOverridden(columnId: ColumnId): boolean {
    return this.overrides.get(columnId)?.width !== undefined;
  }

  /** Same as {@link isWidthOverridden}, addressed by resolved-layout index. */
  isWidthOverriddenAt(layoutIndex: number): boolean {
    const columnId = this.layoutIds[layoutIndex];
    return columnId === undefined ? false : this.isWidthOverridden(columnId);
  }

  /**
   * Move a column to the target layout index. The column adopts the requested
   * pin of the requested target and is placed before it in base order.
   * A drop past the end adopts the last column's pin and inserts after it.
   */
  move(fromIndex: number, toIndex: number): ColumnMoveResult | null {
    if (isValidIndex(fromIndex, this.layoutIds.length) === false) return null;
    const sourceId = this.layoutIds[fromIndex]!;
    const adjustedTo = toIndex > fromIndex ? toIndex - 1 : toIndex;
    if (isValidIndex(adjustedTo, this.layoutIds.length) === false) return null;

    // The requested target is the column at `toIndex`, or the last column for
    // the end insertion edge; the column adopts its requested pin.
    const targetIndex = Math.min(Math.max(toIndex, 0), this.layoutIds.length - 1);
    const targetId = this.layoutIds[targetIndex]!;
    const adoptedPin = this.getPin(targetId);
    const pinChanged = adoptedPin !== this.getPin(sourceId);
    // Dropping a column back onto itself: the adjusted insertion point is the
    // source, so only a pin change can move it.
    if (adjustedTo === fromIndex && pinChanged === false) return null;
    if (pinChanged) this.pins.set(sourceId, adoptedPin);

    // Find the actual target after removal: pinning can put its base-order
    // position before the column that precedes it in the displayed layout.
    this.orderIds.splice(this.orderIds.indexOf(sourceId), 1);
    const baseTarget = this.orderIds.indexOf(targetId);
    const insertAt = toIndex === this.layoutIds.length ? baseTarget + 1 : baseTarget;
    this.orderIds.splice(insertAt, 0, sourceId);
    this.markOrderOverridden();
    this.repartition();
    const landedIndex = this.layoutIds.indexOf(sourceId);
    this.resolve();
    // A drag that lands back where it started changed nothing visible: the
    // pin adoption above is the only thing that could have moved it.
    if (landedIndex === fromIndex && pinChanged === false) return null;
    return { toIndex: landedIndex, pinned: adoptedPin, pinChanged };
  }

  private markOrderOverridden(): void {
    for (const columnId of this.orderIds) this.orderOverridden.add(columnId);
  }

  /** Apply an `order` command, clamped into the column's current region. */
  private moveToIndex(columnId: ColumnId, target: number): void {
    const clamped = clampIndexToRegion(this.partition, columnId, target);
    if (clamped === null) return;
    const from = this.layoutIds.indexOf(columnId);
    // An explicit order is retained even when it matches the current position.
    this.markOrderOverridden();
    if (from === clamped) return;
    const baseFrom = this.orderIds.indexOf(columnId);
    const baseTarget = baseIndexOfLayout(this.orderIds, this.layoutIds, clamped);
    if (baseTarget === null) return;
    const removalShift = baseFrom < baseTarget ? 1 : 0;
    const [removed] = this.orderIds.splice(baseFrom, 1);
    const insertAt = clamped > from ? baseTarget + 1 - removalShift : baseTarget - removalShift;
    this.orderIds.splice(insertAt, 0, removed!);
    this.repartition();
  }

  private definitionIds(): ColumnId[] {
    return this.definitions.map(getColumnId);
  }

  private nextRetainedAfter(
    ids: readonly ColumnId[],
    position: number,
    retained: Set<ColumnId>,
  ): ColumnId | undefined {
    for (let i = position + 1; i < ids.length; i++) {
      const candidate = ids[i]!;
      if (retained.has(candidate)) return candidate;
    }
    return undefined;
  }

  /**
   * Normalize a stored width and diagnose an invalid one once per column id
   * until it becomes valid again. The pure resolvers only normalize.
   */
  private diagnoseWidth(columnId: ColumnId, width: number): number {
    if (isUsableWidth(width)) {
      this.warnedInvalidWidths.delete(columnId);
      return width;
    }
    if (this.warnedInvalidWidths.has(columnId) === false) {
      this.warnedInvalidWidths.add(columnId);
      console.warn(`[gp-grid] Invalid width for column "${columnId}"`);
    }
    return normalizeColumnWidth(width);
  }

  /** Rebuild the pinned order from the definition default and live overrides. */
  private repartition(): void {
    this.partition = partitionByPin(this.orderIds, (columnId) => this.getPin(columnId));
    this.layoutIds = flattenPartition(this.partition);
  }

  private resolve(): void {
    this.repartition();
    // Diagnostics happen here, once per id, but the caller's definition object
    // is never mutated: an invalid declared width is normalized in a copy.
    const byId = new Map<ColumnId, ColumnDefinition>();
    for (const definition of this.definitions) {
      const definitionId = getColumnId(definition);
      const width = this.diagnoseWidth(definitionId, definition.width);
      byId.set(
        definitionId,
        width === definition.width ? definition : { ...definition, width },
      );
    }
    const next = this.layoutIds.map((columnId) => {
      const definition = byId.get(columnId)!;
      const state = this.overrides.get(columnId);
      const pinChanged = this.getPin(columnId) !== (definition.pinned ?? null);
      if (state?.width === undefined && state?.hidden === undefined && pinChanged === false) {
        return definition;
      }
      const resolved = { ...definition };
      if (state?.width !== undefined) resolved.width = this.diagnoseWidth(columnId, state.width);
      if (state?.hidden !== undefined) resolved.hidden = state.hidden;
      if (pinChanged) {
        const pin = this.getPin(columnId);
        if (pin === null) delete resolved.pinned;
        else resolved.pinned = pin;
      }
      return resolved;
    });
    // Only a real change replaces the snapshot: the array's identity is the
    // change signal the geometry resolver caches on, so a no-op command must
    // not manufacture a new layout.
    if (isSameColumnList(this.layout, next)) return;
    this.layout = next;
  }

  private diffSince(
    beforeOrder: readonly ColumnId[],
    beforeLayout: readonly ColumnDefinition[],
  ): ColumnModelChange {
    const orderChanged =
      beforeOrder.length !== this.orderIds.length ||
      beforeOrder.some((id, index) => id !== this.orderIds[index]);
    const beforeById = new Map(
      beforeLayout.map((column) => [getColumnId(column), column]),
    );
    let widthChanged = false;
    let hiddenChanged = false;
    let pinChanged = false;
    // Compare per identity: an order change moves entries between indices.
    for (const after of this.layout) {
      const columnId = getColumnId(after);
      const before = beforeById.get(columnId);
      if (before === undefined) {
        widthChanged = true;
        hiddenChanged = true;
        pinChanged = true;
        continue;
      }
      // Override presence is part of the render contract: an override equal to
      // the definition width still changes how `fit` distributes slack.
      if (before.width !== after.width || this.overridePresenceChanged(columnId)) {
        widthChanged = true;
      }
      if ((before.hidden ?? false) !== (after.hidden ?? false)) hiddenChanged = true;
      if ((before.pinned ?? null) !== (after.pinned ?? null)) pinChanged = true;
    }
    const changed = orderChanged || widthChanged || hiddenChanged || pinChanged;
    return changed ? { orderChanged, widthChanged, hiddenChanged, pinChanged } : NO_CHANGE;
  }

  /**
   * Whether the override membership of `columnId` differs from the layout
   * snapshot taken before the command. The snapshot carries the effective
   * width, so an override equal to the definition width is indistinguishable
   * by number alone.
   */
  private overridePresenceChanged(columnId: ColumnId): boolean {
    return this.isWidthOverridden(columnId) !== this.overriddenBefore.has(columnId);
  }
}
