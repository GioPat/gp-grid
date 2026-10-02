// packages/core/src/grid-core-column-guard.ts
// The column-change guard (PRD 007 D7). While groups are active a guarded
// command snapshots the model, applies its mutation, builds the header runs
// the mutated model gives and, over the fragment budget, restores the
// snapshot before anything is published. A flat grid skips it.

import type { ColumnModel } from "./column-model";
import {
  buildHeaderRuns,
  type ColumnGroupIndex,
  type ColumnSchemaFault,
} from "./column-groups";
import type { GridGeometryService } from "./geometry/grid-geometry";
import type { GridCoreConfig } from "./grid-core-config";
import { formatLabel, type GridLabels } from "./i18n";
import type { InstructionBatcher } from "./managers/instruction-batcher";
import type { ColumnDefinition } from "./types";
import type {
  ColumnSchemaError,
  ColumnSchemaErrorSource,
  ColumnSchemaResult,
} from "./types/column-groups";

/**
 * Called by a command after it mutated the model and before it publishes;
 * `false` means the model was restored and nothing may be published.
 */
export type AdmitColumnChange = () => boolean;

export const admitEveryChange: AdmitColumnChange = () => true;

/** The hierarchy a grid runs under, shared by the geometry and the commands. */
export interface ColumnGroupState {
  /** Active hierarchy; `null` while the grid is flat. */
  index: ColumnGroupIndex | null;
  /** The caller's definitions in their own order, which a flat grid takes. */
  columns: readonly ColumnDefinition[];
}

export interface ColumnGuardDeps {
  batcher: InstructionBatcher;
  columnModel: ColumnModel;
  groups: ColumnGroupState;
  getGeometry: () => GridGeometryService;
  config: Pick<
    GridCoreConfig<unknown>,
    "labels" | "columnGroupLimits" | "onColumnSchemaRejected"
  >;
}

export interface GuardedColumnChange<T> {
  readonly result: ColumnSchemaResult;
  /** What the command returned; `null` or `false` when it applied nothing. */
  readonly value: T;
}

export const COLUMN_CHANGE_APPLIED: ColumnSchemaResult = Object.freeze({ status: "applied" });
export const COLUMN_CHANGE_UNCHANGED: ColumnSchemaResult = Object.freeze({ status: "unchanged" });

const settle = <T>(value: T): GuardedColumnChange<T> => {
  const applied = value !== null && value !== false;
  return { result: applied ? COLUMN_CHANGE_APPLIED : COLUMN_CHANGE_UNCHANGED, value };
};

/** A fault with its command and its label, formatted with `{id}` and `{limit}`. */
export const toColumnSchemaError = (
  fault: ColumnSchemaFault,
  source: ColumnSchemaErrorSource,
  labels: GridLabels,
): ColumnSchemaError => {
  const params: Record<string, string> = {};
  if (fault.id !== undefined) params.id = fault.id;
  if (fault.limit !== undefined) params.limit = fault.limit;
  const message = formatLabel(labels.columnSchemaErrors[fault.code], params);
  return { ...fault, source, message };
};

/** Announce a rejection, report it and return its result. Nothing else changes. */
export const rejectColumnChange = (
  deps: ColumnGuardDeps,
  source: ColumnSchemaErrorSource,
  fault: ColumnSchemaFault,
): ColumnSchemaResult => {
  const error = toColumnSchemaError(fault, source, deps.config.labels);
  const revision = deps.getGeometry().revision;
  deps.batcher.emit({
    type: "SET_ANNOUNCEMENT",
    announcement: { message: error.message, revision },
    revision,
  });
  deps.config.onColumnSchemaRejected?.(error);
  return { status: "rejected", error };
};

interface Admission {
  readonly admit: AdmitColumnChange;
  fault: ColumnSchemaFault | null;
}

const createAdmission = (deps: ColumnGuardDeps, candidate: ColumnGroupIndex): Admission => {
  const memento = deps.columnModel.snapshot();
  const admission: Admission = {
    fault: null,
    admit: () => {
      const layout = deps.getGeometry().previewColumnLayout(candidate);
      const { maxFragments } = deps.config.columnGroupLimits;
      const runs = buildHeaderRuns(layout, candidate, maxFragments);
      if (runs.ok) {
        deps.groups.index = candidate;
        return true;
      }
      admission.fault = runs.error;
      deps.columnModel.restore(memento);
      return false;
    },
  };
  return admission;
};

/**
 * Run a column command under the hierarchy `candidate`, the active one by
 * default. An admitted change adopts `candidate` before it is published.
 */
export const guardColumnChange = <T>(
  deps: ColumnGuardDeps,
  source: ColumnSchemaErrorSource,
  run: (admit: AdmitColumnChange) => T,
  candidate: ColumnGroupIndex | null = deps.groups.index,
): GuardedColumnChange<T> => {
  if (candidate === null) {
    deps.groups.index = null;
    return settle(run(admitEveryChange));
  }
  const admission = createAdmission(deps, candidate);
  const value = run(admission.admit);
  const { fault } = admission;
  if (fault === null) return settle(value);
  return { result: rejectColumnChange(deps, source, fault), value };
};
