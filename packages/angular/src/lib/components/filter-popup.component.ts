import {
  Component,
  ChangeDetectionStrategy,
  computed,
  input,
  output,
  signal,
  effect,
  AfterViewInit,
  OnDestroy,
  TemplateRef,
  ViewChild,
  ElementRef,
  HostListener,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { calculateFilterPopupPosition, defaultGridLabels, formatLabel } from '@gp-grid/core';
import type {
  ColumnDefinition,
  CellValue,
  ColumnFilterModel,
  FilterRendererParams,
  GridLabels,
} from '@gp-grid/core';
import { FILTER_POPUP_TEMPLATE } from './filter-popup.template';
import { FilterContentComponent } from './filter-content.component';
import { resolveColId } from './filter-popup/filter-logic';

export type FilterRendererTemplate = TemplateRef<{ $implicit: FilterRendererParams }>;

@Component({
  selector: 'gp-grid-filter-popup',
  standalone: true,
  imports: [NgTemplateOutlet, FilterContentComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: FILTER_POPUP_TEMPLATE,
})
export class FilterPopupComponent implements AfterViewInit, OnDestroy {
  @ViewChild('popupEl', { static: false }) popupEl!: ElementRef<HTMLDivElement>;

  column = input.required<ColumnDefinition>();
  colIndex = input.required<number>();
  anchorEl = input.required<HTMLElement>();
  distinctValues = input.required<CellValue[]>();
  currentFilter = input<ColumnFilterModel | undefined>(undefined);
  labels = input<GridLabels>(defaultGridLabels);
  filterRenderers = input<Record<string, FilterRendererTemplate>>({});
  globalFilterRenderer = input<FilterRendererTemplate | null>(null);

  apply = output<{ colId: string; filter: ColumnFilterModel | null }>();
  close = output<void>();

  popupTop = signal(0);
  popupLeft = signal(0);
  popupMinWidth = signal(200);
  positioned = signal(false);

  protected customTemplate = computed((): FilterRendererTemplate | null => {
    const renderer: unknown = this.column().filterRenderer;
    if (renderer instanceof TemplateRef) return renderer as FilterRendererTemplate;
    if (typeof renderer === 'string') {
      return this.filterRenderers()[renderer] ?? this.globalFilterRenderer();
    }
    return this.globalFilterRenderer();
  });

  protected rendererParams = computed((): FilterRendererParams => ({
    column: this.column(),
    columnId: resolveColId(this.column()),
    currentFilter: this.currentFilter(),
    distinctValues: this.distinctValues(),
    labels: this.labels(),
    apply: (filter) => this.applyFilter(filter),
    close: () => this.close.emit(),
  }));

  protected filterTitle(): string {
    const column = this.column();
    return formatLabel(this.labels().filterTitle, {
      column: column.headerName ?? column.field,
    });
  }

  constructor() {
    effect(() => {
      this.anchorEl();
      // Update synchronously so the new column's anchor lands before paint,
      // not one frame later (which would briefly show the popup at the
      // previously-open column's position).
      this.updatePosition();
    });
  }

  ngAfterViewInit(): void {
    // Run once the popup element exists; the constructor effect may have run
    // before the view was ready and bailed.
    this.updatePosition();
    requestAnimationFrame(() => {
      document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    });
    // Scroll events don't bubble, so listen in the capture phase on window to
    // catch scrolls from the grid body, the page, and any wrapping scroll
    // container in the host app.
    window.addEventListener('scroll', this.onWindowScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', this.onWindowScrollOrResize);
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.removeEventListener('scroll', this.onWindowScrollOrResize, { capture: true });
    window.removeEventListener('resize', this.onWindowScrollOrResize);
    if (this.repositionRafId !== null) cancelAnimationFrame(this.repositionRafId);
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    this.close.emit();
  }

  applyFilter(filter: ColumnFilterModel | null): void {
    this.apply.emit({ colId: resolveColId(this.column()), filter });
  }

  private updatePosition(): void {
    if (!this.popupEl?.nativeElement) return;
    const pos = calculateFilterPopupPosition(this.anchorEl(), this.popupEl.nativeElement);
    this.popupTop.set(pos.top);
    this.popupLeft.set(pos.left);
    this.popupMinWidth.set(pos.minWidth);
    this.positioned.set(true);
  }

  private onDocumentPointerDown = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.closest('.gp-grid-filter-icon')) return;
    if (this.popupEl?.nativeElement?.contains(target)) return;
    this.close.emit();
  };

  private repositionRafId: number | null = null;

  private onWindowScrollOrResize = (): void => {
    if (this.repositionRafId !== null) return;
    this.repositionRafId = requestAnimationFrame(() => {
      this.repositionRafId = null;
      this.updatePosition();
    });
  };
}
