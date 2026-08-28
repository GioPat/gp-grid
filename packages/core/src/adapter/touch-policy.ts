import type { GridCore } from "../grid-core";

/**
 * Inline touch policy of the scroll element while synthetic scrolling is
 * attached. While scroll scaling is active, panning must never be native:
 * declare `touch-action: none` so the browser cannot start a
 * (ratio-amplified) native scroll at all, and contain overscroll so
 * synthetic flings do not chain to the page. Non-scaled grids keep their
 * original native policy, which is restored verbatim on dispose.
 *
 * Browsers — iOS Safari especially — sample `touch-action` at gesture
 * start, so a policy applied inside touchstart only takes effect from the
 * NEXT gesture. Subscribing to the core's content-size instructions applies
 * the policy the moment scaling flips, before any finger goes down.
 */
export class TouchPolicy<TData = unknown> {
  private readonly savedOverscrollBehavior: string;
  private readonly savedTouchAction: string;
  /** Core whose batch instructions currently drive eager policy syncs */
  private subscribedCore: GridCore<TData> | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly el: HTMLElement;
  private readonly getCore: () => GridCore<TData> | null;

  constructor(el: HTMLElement, getCore: () => GridCore<TData> | null) {
    this.el = el;
    this.getCore = getCore;
    this.savedOverscrollBehavior = el.style.overscrollBehavior;
    this.savedTouchAction = el.style.touchAction;
  }

  /** Rebind to the current core and apply the policy for its scaling state. */
  sync(): void {
    this.syncSubscription();
    this.apply();
  }

  /** Drop the subscription and restore the element's original policy. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.subscribedCore = null;
    this.el.style.overscrollBehavior = this.savedOverscrollBehavior;
    this.el.style.touchAction = this.savedTouchAction;
  }

  private syncSubscription(): void {
    const core = this.getCore();
    if (core === this.subscribedCore) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.subscribedCore = core;
    if (core === null) return;
    this.unsubscribe = core.onBatchInstruction((instructions) => {
      const contentSizeChanged = instructions.some(
        (instruction) => instruction.type === "SET_CONTENT_SIZE",
      );
      if (contentSizeChanged) this.apply();
    });
  }

  private apply(): void {
    const scaling = this.getCore()?.isScalingActive() === true;
    const touchAction = scaling ? "none" : this.savedTouchAction;
    const overscroll = scaling ? "contain" : this.savedOverscrollBehavior;
    const style = this.el.style;
    if (style.touchAction !== touchAction) style.touchAction = touchAction;
    if (style.overscrollBehavior !== overscroll) style.overscrollBehavior = overscroll;
  }
}
