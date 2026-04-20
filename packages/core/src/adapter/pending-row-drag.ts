import type { GridCore } from "../grid-core";
import type { DragState } from "../types/input";

export interface PendingRowDragDeps<TData = unknown> {
  getCore: () => GridCore<TData> | null;
  getContainer: () => HTMLElement | null;
  isBrowser: boolean;
  onDragConfirmed: (state: DragState) => void;
}

const DRAG_THRESHOLD_PX = 10;
const DRAG_HOLD_MS = 300;

/**
 * Row-drag pending state machine. When a row-drag handle is pressed, we
 * must distinguish a tap/click (no drag) from an intentional hold (drag).
 *
 * Algorithm:
 *  - start() arms a 300ms timer and listens for pointermove/up on document.
 *  - If the pointer moves >10px before the timer fires → cancel (treat as tap).
 *  - If the pointer releases before the timer fires → cancel.
 *  - If the timer fires first → confirm: lock container overflow, block
 *    touchmove, capture the pointer, and tell the caller the drag is live.
 *
 * Framework-agnostic: accepts plain getter/callback deps and touches only
 * the document/element DOM APIs. Wrappers gate construction on browser.
 */
export class PendingRowDragController<TData = unknown> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private capture: { pointerId: number; target: Element } | null = null;
  private savedContainerOverflow: string | null = null;
  private readonly blockTouchMove = (e: TouchEvent): void => e.preventDefault();
  private readonly deps: PendingRowDragDeps<TData>;

  constructor(deps: PendingRowDragDeps<TData>) {
    this.deps = deps;
  }

  start(event: PointerEvent): void {
    this.cancel();
    this.capture = {
      pointerId: event.pointerId,
      target: event.currentTarget as Element,
    };
    const startX = event.clientX;
    const startY = event.clientY;

    const onMove = (moveE: PointerEvent): void => {
      const dx = moveE.clientX - startX;
      const dy = moveE.clientY - startY;
      if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
        this.cancel();
        cleanup();
      }
    };
    const onUp = (): void => {
      this.cancel();
      cleanup();
    };
    const cleanup = (): void => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
    document.addEventListener("pointercancel", onUp, { once: true });

    this.timer = setTimeout(() => {
      this.timer = null;
      cleanup();
      this.confirm();
    }, DRAG_HOLD_MS);
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.deps.getCore()?.input.cancelPendingRowDrag();
    this.capture = null;
  }

  releaseLocks(): void {
    if (!this.deps.isBrowser) return;
    const containerEl = this.deps.getContainer();
    if (this.savedContainerOverflow !== null && containerEl) {
      containerEl.style.overflow = this.savedContainerOverflow;
    }
    this.savedContainerOverflow = null;
    document.removeEventListener("touchmove", this.blockTouchMove);
  }

  private confirm(): void {
    const core = this.deps.getCore();
    const capture = this.capture;
    this.capture = null;
    if (core === null) return;
    if (!core.input.confirmPendingRowDrag()) return;

    this.lockContainer();
    document.addEventListener("touchmove", this.blockTouchMove, { passive: false });
    this.applyPointerCapture(capture);
    this.deps.onDragConfirmed(core.input.getDragState());
  }

  private lockContainer(): void {
    const containerEl = this.deps.getContainer();
    if (!containerEl) return;
    this.savedContainerOverflow = containerEl.style.overflow;
    containerEl.style.overflow = "hidden";
  }

  private applyPointerCapture(capture: { pointerId: number; target: Element } | null): void {
    if (!capture) return;
    capture.target.setPointerCapture(capture.pointerId);
  }
}
