import type { GridCore } from "../grid-core";

export class SelectionDrag<TData = unknown> {
  private active = false;
  private readonly core: GridCore<TData>;

  constructor(core: GridCore<TData>) {
    this.core = core;
  }

  get isActive(): boolean {
    return this.active;
  }

  start(): void {
    this.active = true;
  }

  moveToTarget(row: number, col: number): void {
    if (this.active === false) return;
    this.core.selection.startSelection({ row, col }, { shift: true });
  }

  end(): void {
    this.active = false;
  }
}
