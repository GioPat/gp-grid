import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ResizeTarget } from '@gp-grid/core';

export type ResizeAxis = ResizeTarget['axis'];

export interface ResizeHandlePointerDownEvent {
  /** Layout index of the column, or view index of the row. */
  index: number;
  /** Displayed width or height of the target. */
  size: number;
  event: PointerEvent;
}

const HANDLE_CLASS: Record<ResizeAxis, string> = {
  column: 'gp-grid-header-resize-handle',
  row: 'gp-grid-row-resize-handle',
};

/**
 * Pointer-only edge target: a drag resizes, a double-click fits, and neither
 * reaches the cell underneath. The grid keys are its keyboard equivalent.
 */
@Component({
  selector: 'div[gpGridResizeHandle]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    'aria-hidden': 'true',
    '[class]': 'hostClass()',
    '(pointerdown)': 'onPointerDown($event)',
    '(dblclick)': 'onDoubleClick($event)',
  },
})
export class ResizeHandleComponent {
  axis = input.required<ResizeAxis>();
  index = input.required<number>();
  size = input.required<number>();
  /** Whether this handle's target is being dragged. */
  resizing = input<boolean>(false);

  resizePointerDown = output<ResizeHandlePointerDownEvent>();
  resizeDoubleClick = output<ResizeTarget>();

  protected hostClass = computed(() => {
    const base = HANDLE_CLASS[this.axis()];
    return this.resizing() ? `${base} ${base}--active` : base;
  });

  private target(): ResizeTarget {
    if (this.axis() === 'row') return { axis: 'row', rowIndex: this.index() };
    return { axis: 'column', colIndex: this.index() };
  }

  protected onPointerDown(event: PointerEvent): void {
    event.stopPropagation();
    this.resizePointerDown.emit({ index: this.index(), size: this.size(), event });
  }

  protected onDoubleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.resizeDoubleClick.emit(this.target());
  }
}
