// packages/core/src/column-model.ts
// Owns the three column layers: immutable caller definitions, live column
// state keyed by ColumnId, and the resolved layout everything else reads.

import type {
  ColumnDefinition,
  ColumnId,
  ColumnState,
  ColumnStateSnapshot,
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
}

const NO_CHANGE: ColumnModelChange = {
  orderChanged: false,
  widthChanged: false,
  hiddenChanged: false,
};

/** Normalized identity of a definition: `colId ?? field`. */
export const getColumnId = (column: ColumnDefinition): ColumnId =>
  column.colId ?? column.field;

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
  private readonly overrides = new Map<ColumnId, ColumnState>();
  private orderIds: ColumnId[] = [];
  private idSet: ReadonlySet<ColumnId> = new Set();
  /** IDs whose position came from an explicit user move, not definition order. */
  private readonly orderOverridden = new Set<ColumnId>();
  private layout: ColumnDefinition[] = [];
  private readonly warnedDuplicateIds = new Set<ColumnId>();

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
    }

    this.definitions = unique;
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
    for (const update of updates) {
      if (this.has(update.columnId) === false) continue;
      if (update.width === undefined && update.hidden === undefined) continue;
      const state = this.overrides.get(update.columnId) ?? {};
      if (update.width !== undefined) state.width = update.width;
      if (update.hidden !== undefined) state.hidden = update.hidden;
      this.overrides.set(update.columnId, state);
    }
    for (const update of updates) {
      if (update.order === undefined || this.has(update.columnId) === false) continue;
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
    if (columnIds === undefined) {
      this.overrides.clear();
      this.orderOverridden.clear();
      this.orderIds = this.definitionIds();
      this.resolve();
      return this.diffSince(beforeOrder, beforeLayout);
    }

    const resetSet = new Set(columnIds);
    for (const id of columnIds) {
      this.overrides.delete(id);
      this.orderOverridden.delete(id);
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

  /** Effective per-column state, in layout order. */
  getState(): ColumnStateSnapshot[] {
    return this.layout.map((column, order) => ({
      columnId: getColumnId(column),
      width: column.width,
      hidden: column.hidden ?? false,
      order,
    }));
  }

  ids(): ColumnId[] {
    return [...this.orderIds];
  }

  has(columnId: ColumnId): boolean {
    return this.idSet.has(columnId);
  }

  indexOf(columnId: ColumnId): number {
    return this.orderIds.indexOf(columnId);
  }

  idAt(index: number): ColumnId | undefined {
    return this.orderIds[index];
  }

  columnAt(index: number): ColumnDefinition | undefined {
    return this.layout[index];
  }

  setWidth(columnId: ColumnId, width: number): void {
    if (this.has(columnId) === false) return;
    const state = this.overrides.get(columnId) ?? {};
    state.width = width;
    this.overrides.set(columnId, state);
    this.resolve();
  }

  /** Move a column to a target layout index; returns the applied index. */
  move(fromIndex: number, toIndex: number): number | null {
    if (isValidIndex(fromIndex, this.orderIds.length) === false) return null;
    const adjustedTo = toIndex > fromIndex ? toIndex - 1 : toIndex;
    if (isValidIndex(adjustedTo, this.orderIds.length) === false) return null;
    if (adjustedTo === fromIndex) return null;
    const [columnId] = this.orderIds.splice(fromIndex, 1);
    this.orderIds.splice(adjustedTo, 0, columnId!);
    this.markOrderOverridden();
    this.resolve();
    return adjustedTo;
  }

  private markOrderOverridden(): void {
    for (const id of this.orderIds) this.orderOverridden.add(id);
  }

  private moveToIndex(columnId: ColumnId, target: number): void {
    const from = this.orderIds.indexOf(columnId);
    if (from === -1) return;
    const to = Math.max(0, Math.min(target, this.orderIds.length - 1));
    // An explicit order is retained even when it matches the current position.
    this.markOrderOverridden();
    if (from === to) return;
    this.orderIds.splice(from, 1);
    this.orderIds.splice(to, 0, columnId);
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

  private resolve(): void {
    const byId = new Map<ColumnId, ColumnDefinition>();
    for (const definition of this.definitions) {
      byId.set(getColumnId(definition), definition);
    }
    this.layout = this.orderIds.map((columnId) => {
      const definition = byId.get(columnId)!;
      const state = this.overrides.get(columnId);
      if (state?.width === undefined && state?.hidden === undefined) {
        return definition;
      }
      const resolved = { ...definition };
      if (state.width !== undefined) resolved.width = state.width;
      if (state.hidden !== undefined) resolved.hidden = state.hidden;
      return resolved;
    });
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
    // Compare per identity: an order change moves entries between indices.
    for (const after of this.layout) {
      const before = beforeById.get(getColumnId(after));
      if (before === undefined) {
        widthChanged = true;
        hiddenChanged = true;
        continue;
      }
      if (before.width !== after.width) widthChanged = true;
      if ((before.hidden ?? false) !== (after.hidden ?? false)) hiddenChanged = true;
    }
    const changed = orderChanged || widthChanged || hiddenChanged;
    return changed ? { orderChanged, widthChanged, hiddenChanged } : NO_CHANGE;
  }
}
