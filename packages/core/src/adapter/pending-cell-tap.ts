import type { GridCore } from "../grid-core";
import { TAP_SLOP_PX } from "../input/interaction-constants";

export interface PendingCellTapDeps<TData = unknown> {
  getCore: () => GridCore<TData> | null;
  isBrowser: boolean;
  /** Called after a tap confirmed selection (wrapper focuses the container). */
  onTapConfirmed: () => void;
}

/**
 * Tap confirmation state machine for touch cell selection. On touch,
 * selection is deferred from pointerdown to a confirmed tap so a scroll
 * gesture never selects a cell (and never shows the fill handle).
 *
 * Algorithm:
 *  - start() listens for pointermove/up/cancel on document.
 *  - If the pointer moves beyond the tap slop → cancel (it is a scroll;
 *    covers scaled mode where the synthetic scroller keeps pointermove alive).
 *  - On pointercancel → cancel (native scroll claimed the gesture in
 *    non-scaled mode, or a system gesture took over).
 *  - On pointerup within the slop → confirm: core applies the selection.
 *
 * Framework-agnostic: accepts plain getter/callback deps and touches only
 * the document DOM APIs. Wrappers gate construction on browser.
 */
export class PendingCellTapController<TData = unknown> {
  private cleanup: (() => void) | null = null;
  private readonly deps: PendingCellTapDeps<TData>;

  constructor(deps: PendingCellTapDeps<TData>) {
    this.deps = deps;
  }

  start(event: PointerEvent): void {
    if (!this.deps.isBrowser) return;
    // Detach stale listeners only — the core pending record for THIS tap was
    // just set by the input handler and must survive.
    this.detachListeners();
    const startX = event.clientX;
    const startY = event.clientY;

    const onMove = (moveE: PointerEvent): void => {
      const dx = moveE.clientX - startX;
      const dy = moveE.clientY - startY;
      if (Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) {
        this.cancel();
      }
    };
    const onCancel = (): void => {
      this.cancel();
    };
    const onUp = (): void => {
      this.detachListeners();
      const core = this.deps.getCore();
      if (core?.input.confirmPendingCellTap()) {
        this.deps.onTapConfirmed();
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
    document.addEventListener("pointercancel", onCancel, { once: true });
    this.cleanup = (): void => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
    };
  }

  cancel(): void {
    this.detachListeners();
    this.deps.getCore()?.input.cancelPendingCellTap();
  }

  private detachListeners(): void {
    if (this.cleanup === null) return;
    this.cleanup();
    this.cleanup = null;
  }
}
