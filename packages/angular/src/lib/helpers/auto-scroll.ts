export class AutoScrollDriver {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastPointerEvent: PointerEvent | null = null;

  constructor(
    private readonly getBodyEl: () => HTMLElement | null,
    private readonly onTick: (event: PointerEvent) => void,
  ) {}

  recordPointer(event: PointerEvent): void {
    this.lastPointerEvent = event;
  }

  clearPointer(): void {
    this.lastPointerEvent = null;
  }

  start(dx: number, dy: number): void {
    this.stop();
    this.intervalId = setInterval(() => {
      const bodyEl = this.getBodyEl();
      if (!bodyEl) return;
      bodyEl.scrollTop += dy;
      bodyEl.scrollLeft += dx;
      const last = this.lastPointerEvent;
      if (last) this.onTick(last);
    }, 16);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
