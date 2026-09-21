// packages/core/src/geometry/readonly-geometry.ts

import type { GridGeometry } from "../types/geometry";

/**
 * Query-only view of the geometry service. Its mutators skip the facade's
 * publication work, so they must not be reachable from `GridCore.geometry`.
 */
export const toReadonlyGeometry = (service: GridGeometry): GridGeometry =>
  Object.freeze({
    get revision() {
      return service.revision;
    },
    getColumnLayout: () => service.getColumnLayout(),
    getRowWindow: () => service.getRowWindow(),
    getVisibleRowWindow: () => service.getVisibleRowWindow(),
    getRowBounds: (viewIndex, space) => service.getRowBounds(viewIndex, space),
    getColumnBounds: (layoutIndex, space) => service.getColumnBounds(layoutIndex, space),
    getColumn: (layoutIndex) => service.getColumn(layoutIndex),
    getColumnClip: (layoutIndex) => service.getColumnClip(layoutIndex),
    getCenterClip: () => service.getCenterClip(),
    getColumnWindow: () => service.getColumnWindow(),
    getCellBounds: (viewIndex, layoutIndex, space) =>
      service.getCellBounds(viewIndex, layoutIndex, space),
    getRowEdgeOffset: (boundaryIndex, space) => service.getRowEdgeOffset(boundaryIndex, space),
    hitTest: (point) => service.hitTest(point),
    getScrollTarget: (viewIndex, layoutIndex, from) =>
      service.getScrollTarget(viewIndex, layoutIndex, from),
    getContentSize: () => service.getContentSize(),
  } satisfies GridGeometry);
