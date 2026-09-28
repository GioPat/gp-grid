// packages/core/src/geometry/geometry-revision.ts
// Version of the committed geometry dependencies (columns, row axis, viewport
// dimensions and mapping parameters), not of raw scroll positions. Every
// condition that ends in a revision bump names the dependency it observes.

import type { AxisBounds } from "../types/geometry";
import type { AxisWindow } from "./virtual-axis";

/** A new axis object is a committed dependency change even when no window moved. */
export interface GeometryRevision {
  get(): number;
  bump(): number;
  /** Bump when `next` differs from the window committed for `key`. */
  observeWindow(key: string, next: AxisWindow): boolean;
  /**
   * Bump when the value committed for `key` is a different object. Committed
   * dependencies a query reads (the row axis) are replaced, not mutated, so
   * identity is the change signal even when no window moved.
   */
  observeIdentity(key: string, next: object): boolean;
  /** Bump when the viewport dimensions differ from the committed ones. */
  observeDimensions(width: number, height: number): boolean;
}

const isSameWindow = (a: AxisBounds, b: AxisBounds): boolean =>
  a.start === b.start && a.end === b.end;

export const createGeometryRevision = (): GeometryRevision => {
  let revision = 0;
  const windows = new Map<string, AxisBounds>();
  const identities = new Map<string, object>();
  let width = -1;
  let height = -1;

  return {
    get: () => revision,
    bump: () => {
      revision += 1;
      return revision;
    },
    observeWindow: (key, next) => {
      const previous = windows.get(key);
      if (previous !== undefined && isSameWindow(previous, next)) return false;
      windows.set(key, next);
      revision += 1;
      return true;
    },
    observeIdentity: (key, next) => {
      if (identities.get(key) === next) return false;

      identities.set(key, next);
      revision += 1;
      return true;
    },
    observeDimensions: (nextWidth, nextHeight) => {
      if (nextWidth === width && nextHeight === height) return false;
      width = nextWidth;
      height = nextHeight;
      revision += 1;
      return true;
    },
  };
};
