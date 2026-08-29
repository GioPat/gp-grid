import type { PointerEventData } from "../types/input";
import { DRAG_THRESHOLD } from "./auto-scroll-util";

/**
 * Pointer-drag bookkeeping shared by the row and column-move drags: the
 * start point, the movement-threshold gate that separates a click from a
 * drag, the current pointer position, and the resolved drop target.
 */
export class DragGesture {
  active = false;
  thresholdMet = false;
  startX = 0;
  startY = 0;
  currentX = 0;
  currentY = 0;
  dropTargetIndex: number | null = null;

  get isDraggingForDisplay(): boolean {
    return this.active && this.thresholdMet;
  }

  begin(clientX: number, clientY: number): void {
    this.active = true;
    this.startX = clientX;
    this.startY = clientY;
    this.thresholdMet = false;
    this.currentX = clientX;
    this.currentY = clientY;
    this.dropTargetIndex = null;
  }

  /**
   * Record the pointer position once the drag threshold has been crossed.
   * Returns false (and records nothing) while the pointer is still within
   * the click tolerance.
   */
  track(event: PointerEventData): boolean {
    if (this.thresholdMet === false) {
      const dx = event.clientX - this.startX;
      const dy = event.clientY - this.startY;
      const thresholdCrossed = Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD;
      if (thresholdCrossed === false) return false;
      this.thresholdMet = true;
    }

    this.currentX = event.clientX;
    this.currentY = event.clientY;
    return true;
  }

  reset(): void {
    this.active = false;
    this.thresholdMet = false;
    this.dropTargetIndex = null;
  }
}
