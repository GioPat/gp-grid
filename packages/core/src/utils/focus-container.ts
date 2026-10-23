// packages/core/src/utils/focus-container.ts

/**
 * Move the keyboard focus back to the grid container that holds `from`, so the
 * arrows keep working after an editor closes; nothing when `from` is outside a grid.
 */
export const focusGridContainer = (from: Element | null | undefined): void => {
  from?.closest<HTMLElement>(".gp-grid-container")?.focus({ preventScroll: true });
};
