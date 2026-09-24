// packages/core/src/geometry/row-mapping.ts
// The compressed-scroll row mapping: DOM↔logical conversion and the reachable
// logical range. Pure over an injected mapping.

export interface RowScrollMapping {
  /** Effective DOM scroll sample: the touch override when one is active. */
  getDomScrollTop(): number;
  /** DOM scrollTop for a logical (content) scrollTop. */
  toDomScrollTop(logical: number): number;
  /** Logical (content) scrollTop for a DOM scrollTop. */
  toLogicalScrollTop(dom: number): number;
  isScalingActive(): boolean;
  /** End of the logical scroll range the DOM scroller can reach. */
  getMaxLogicalScrollTop(): number;
}

export interface RowMappingDeps {
  mapping: RowScrollMapping;
}

export interface RowMapper {
  toLogicalScrollTop(dom: number): number;
  toDomScrollTop(logical: number): number;
  /** Logical scroll top for the effective scroll sample. */
  getLogicalScrollTop(): number;
  hasVerticalCompression(): boolean;
  getMaxLogicalScrollTop(): number;
  /** DOM position for a logical scroll top, clamped to the reachable range. */
  toDomScrollTopClamped(logical: number): number;
}

export const clampFirstVisible = (index: number, count: number): number =>
  Math.min(Math.max(index, 0), count);

export const createRowMapper = (deps: RowMappingDeps): RowMapper => {
  const { mapping } = deps;

  const getLogicalScrollTop = (): number =>
    mapping.toLogicalScrollTop(mapping.getDomScrollTop());

  const getMaxLogicalScrollTop = (): number => mapping.getMaxLogicalScrollTop();

  const toDomScrollTopClamped = (logical: number): number => {
    const maxLogical = getMaxLogicalScrollTop();
    const bounded = Math.min(Math.max(logical, 0), maxLogical);
    if (mapping.isScalingActive() === false) return bounded;
    if (maxLogical <= 0) return 0;
    return mapping.toDomScrollTop(maxLogical) * (bounded / maxLogical);
  };

  return {
    toLogicalScrollTop: (dom) => mapping.toLogicalScrollTop(dom),
    toDomScrollTop: (logical) => mapping.toDomScrollTop(logical),
    getLogicalScrollTop,
    hasVerticalCompression: () => mapping.isScalingActive(),
    getMaxLogicalScrollTop,
    toDomScrollTopClamped,
  };
};
