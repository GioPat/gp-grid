/**
 * Update a cachedRows map in-place to mirror a splice operation performed
 * on the underlying data source: remove element at `sourceIndex`, then
 * insert it at `targetIndex` (pre-removal index space — the same
 * semantics as a standard array move).
 *
 * When the moved row isn't cached, nothing happens. Gaps (undefined
 * neighbors) are preserved by deleting rather than setting, so a sparse
 * cache stays sparse.
 */
export const reorderCachedRows = <TData>(
  cachedRows: Map<number, TData>,
  sourceIndex: number,
  targetIndex: number,
): void => {
  const movedRow = cachedRows.get(sourceIndex);
  if (movedRow === undefined) return;

  if (sourceIndex < targetIndex) {
    const placementIndex = targetIndex - 1;
    for (let i = sourceIndex; i < placementIndex; i++) {
      const neighbor = cachedRows.get(i + 1);
      if (neighbor === undefined) cachedRows.delete(i);
      else cachedRows.set(i, neighbor);
    }
    cachedRows.set(placementIndex, movedRow);
    return;
  }

  for (let i = sourceIndex; i > targetIndex; i--) {
    const neighbor = cachedRows.get(i - 1);
    if (neighbor === undefined) cachedRows.delete(i);
    else cachedRows.set(i, neighbor);
  }
  cachedRows.set(targetIndex, movedRow);
};
