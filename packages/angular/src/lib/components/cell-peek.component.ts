import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  TemplateRef,
  ViewChild,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  bindPeekSelectAll,
  formatCellValue,
  getFieldValue,
  type CellPosition,
  type CellRendererParams,
  type CellValue,
  type ColumnDefinition,
  type RowId,
} from '@gp-grid/core';
import type { CellRendererTemplate } from './grid-body.component';

const TEMPLATE = `
  <div
    #overlayEl
    class="gp-grid-cell-peek"
    [style.position]="'fixed'"
    [style.top.px]="top()"
    [style.left.px]="left()"
    [style.width.px]="width()"
    [style.visibility]="positioned() ? 'visible' : 'hidden'">
    @if (template(); as tpl) {
      <ng-container
        [ngTemplateOutlet]="tpl"
        [ngTemplateOutletContext]="{ $implicit: rendererParams() }">
      </ng-container>
    } @else {
      {{ fallbackText() }}
    }
  </div>
`;

@Component({
  selector: 'gp-grid-cell-peek',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: TEMPLATE,
})
export class CellPeekComponent implements AfterViewInit, OnDestroy {
  @ViewChild('overlayEl', { static: false }) overlayEl!: ElementRef<HTMLDivElement>;

  peekCell = input.required<CellPosition>();
  column = input.required<ColumnDefinition>();
  rowData = input.required<unknown>();
  readCellValue = input<((rowIndex: number, colIndex: number) => CellValue) | null>(null);
  readFieldValue = input<((rowIndex: number, field: string) => CellValue) | null>(null);
  readRowId = input<((rowIndex: number) => RowId | undefined) | null>(null);
  containerEl = input.required<HTMLElement | null>();
  cellRenderers = input<Record<string, CellRendererTemplate>>({});
  globalCellRenderer = input<CellRendererTemplate | null>(null);

  close = output<void>();

  protected top = signal(0);
  protected left = signal(0);
  protected width = signal(0);
  protected positioned = signal(false);

  protected template = computed<CellRendererTemplate | null>(() => {
    const renderer: unknown = this.column().cellRenderer;
    if (renderer instanceof TemplateRef) return renderer as CellRendererTemplate;
    if (typeof renderer === 'string') {
      const registered = this.cellRenderers()[renderer];
      if (registered) return registered;
    }
    return this.globalCellRenderer();
  });

  private rawValueFor(col: ColumnDefinition): CellValue {
    const read = this.readCellValue();
    if (read) return read(this.peekCell().row, this.peekCell().col);
    return getFieldValue(this.rowData(), col.field);
  }

  protected rendererParams = computed<CellRendererParams>(() => {
    const col = this.column();
    const data = this.rowData();
    const rawValue = this.rawValueFor(col);
    const displayValue = col.valueFormatter ? col.valueFormatter(rawValue) : rawValue;
    const readField = this.readFieldValue();
    const rowIndex = this.peekCell().row;
    return {
      value: displayValue,
      rowData: data,
      rowId: this.readRowId()?.(rowIndex),
      columnId: col.colId ?? col.field,
      getValue: (field: string) => (readField ? readField(rowIndex, field) : null),
      column: col,
      rowIndex: this.peekCell().row,
      colIndex: this.peekCell().col,
      isActive: true,
      isSelected: false,
      isEditing: false,
    };
  });

  protected fallbackText = computed<string>(() => {
    const col = this.column();
    const renderer = col.cellRenderer;
    const value = this.rawValueFor(col);
    if (typeof renderer === 'function') {
      const result = renderer(this.rendererParams());
      return result === null || result === undefined ? '' : String(result);
    }
    return formatCellValue(value, col.valueFormatter);
  });

  private rafId: number | null = null;
  private pointerRafId: number | null = null;
  private unbindSelectAll: (() => void) | null = null;

  constructor() {
    effect(() => {
      this.peekCell();
      this.updatePosition();
    });
  }

  ngAfterViewInit(): void {
    this.updatePosition();
    window.addEventListener('scroll', this.onWindowScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', this.onWindowScrollOrResize);
    if (this.overlayEl?.nativeElement) {
      this.unbindSelectAll = bindPeekSelectAll(this.overlayEl.nativeElement);
    }
    this.pointerRafId = requestAnimationFrame(() => {
      document.addEventListener('pointerdown', this.onDocumentPointerDown);
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onWindowScrollOrResize, { capture: true });
    window.removeEventListener('resize', this.onWindowScrollOrResize);
    document.removeEventListener('pointerdown', this.onDocumentPointerDown);
    this.unbindSelectAll?.();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.pointerRafId !== null) cancelAnimationFrame(this.pointerRafId);
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    this.close.emit();
  }

  private updatePosition(): void {
    const container = this.containerEl();
    const overlay = this.overlayEl?.nativeElement;
    if (!container || !overlay) return;

    const peek = this.peekCell();
    const cellEl = container.querySelector(
      `[data-cell-row="${peek.row}"][data-cell-col="${peek.col}"]`,
    ) as HTMLElement | null;
    if (!cellEl) {
      this.close.emit();
      return;
    }

    const rect = cellEl.getBoundingClientRect();
    this.top.set(rect.top);
    this.left.set(rect.left);
    this.width.set(rect.width);
    this.positioned.set(true);
  }

  private onWindowScrollOrResize = (): void => {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.updatePosition();
    });
  };

  private onDocumentPointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement;
    if (this.overlayEl?.nativeElement?.contains(target)) return;
    this.close.emit();
  };
}
