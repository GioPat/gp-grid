import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  TemplateRef,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import type {
  HeaderData,
  VisibleColumnInfo,
  ColumnDefinition,
  ColumnLayout,
  HeaderRendererParams,
  SortDirection,
} from '@gp-grid/core';

export type HeaderRendererTemplate = TemplateRef<{ $implicit: HeaderRendererParams }>;

export interface HeaderSortEvent {
  colId: string;
  direction: SortDirection | null;
  addToExisting: boolean;
}

export interface HeaderPointerDownEvent {
  colIndex: number;
  colWidth: number;
  colHeight: number;
  event: PointerEvent;
}

export interface FilterPointerDownEvent {
  colIndex: number;
  anchorEl: HTMLElement;
}

export interface ResizePointerDownEvent {
  colIndex: number;
  colWidth: number;
  event: PointerEvent;
}

const TEMPLATE = `
  <div
    class="gp-grid-header"
    [class.gp-grid-header--loading]="isLoading()"
    [style.height.px]="headerHeight()">
    <div
      style="position: absolute; top: 0; left: 0;"
      [style.transform]="transformStyle()"
      [style.width.px]="innerWidth()"
      [style.height.px]="headerHeight()">
      @for (entry of visibleColumnsWithIndices(); track entry.originalIndex; let i = $index) {
        @let layoutItem = columnLayout().items.find(item => item.originalIndex === entry.originalIndex);
        @let colW = columnWidths()[i] ?? 0;
        @let headerData = headers().get(entry.originalIndex);
        @let tpl = headerTemplate(entry.column);
        <div
          class="gp-grid-header-cell"
          [attr.data-col-index]="entry.originalIndex"
          [style.left.px]="columnPositions()[i]"
          [style.width.px]="colW"
          [style.height.px]="headerHeight()"
          (pointerdown)="onHeaderPointerDown($event, entry.originalIndex, colW)">
          @if (tpl) {
            <ng-container
              [ngTemplateOutlet]="tpl"
              [ngTemplateOutletContext]="{ $implicit: headerParams(entry.column, entry.originalIndex, headerData) }">
            </ng-container>
          } @else {
            <span class="gp-grid-header-text">{{ entry.column.headerName ?? entry.column.field }}</span>
          }
          <span class="gp-grid-header-icons">
            @if (sortingEnabled() && entry.column.sortable !== false) {
              <span class="gp-grid-sort-arrows">
                <span class="gp-grid-sort-arrows-stack">
                  <svg
                    [class]="'gp-grid-sort-arrow-up' + (headerData?.sortDirection === 'asc' ? ' active' : '')"
                    width="8" height="6" viewBox="0 0 8 6">
                    <path d="M4 0L8 6H0L4 0Z" fill="currentColor"/>
                  </svg>
                  <svg
                    [class]="'gp-grid-sort-arrow-down' + (headerData?.sortDirection === 'desc' ? ' active' : '')"
                    width="8" height="6" viewBox="0 0 8 6">
                    <path d="M4 6L0 0H8L4 6Z" fill="currentColor"/>
                  </svg>
                </span>
                @if ((headerData?.sortIndex ?? 0) > 0) {
                  <span class="gp-grid-sort-index">{{ headerData?.sortIndex }}</span>
                }
              </span>
            }
            @if (entry.column.filterable !== false) {
              <span
                [class]="'gp-grid-filter-icon' + (headerData?.hasFilter ? ' active' : '')"
                (pointerdown)="onFilterPointerDown($event, entry.originalIndex)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 4h16l-6 8v5l-4 2v-7L4 4z"/>
                </svg>
              </span>
            }
          </span>
          @if (entry.column.resizable !== false) {
            <div
              [class]="'gp-grid-header-resize-handle' + (layoutItem?.region === 'right' ? ' gp-grid-header-resize-handle--inside' : '')"
              (pointerdown)="onResizePointerDown($event, entry.originalIndex, colW)">
            </div>
          }
        </div>
      }
    </div>
  </div>
`;

@Component({
  selector: 'gp-grid-header',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: TEMPLATE,
})
export class GridHeaderComponent {
  headerHeight = input.required<number>();
  scrollLeft = input.required<number>();
  contentWidth = input.required<number>();
  totalWidth = input.required<number>();
  isLoading = input.required<boolean>();
  visibleColumnsWithIndices = input.required<VisibleColumnInfo[]>();
  columnLayout = input.required<ColumnLayout>();
  columnPositions = input.required<number[]>();
  columnWidths = input.required<number[]>();
  headers = input.required<Map<number, HeaderData>>();
  sortingEnabled = input<boolean>(true);
  headerRenderers = input<Record<string, HeaderRendererTemplate>>({});
  globalHeaderRenderer = input<HeaderRendererTemplate | null>(null);

  headerPointerDown = output<HeaderPointerDownEvent>();
  filterPointerDown = output<FilterPointerDownEvent>();
  resizePointerDown = output<ResizePointerDownEvent>();
  headerSort = output<HeaderSortEvent>();
  headerFilterOpen = output<{ colIndex: number; anchorEl: HTMLElement }>();

  protected innerWidth = computed(() =>
    Math.max(this.contentWidth(), this.totalWidth())
  );

  protected transformStyle = computed(() =>
    'translate3d(calc(-1 * var(--gp-grid-scroll-left, 0px)), 0, 0)'
  );

  protected onHeaderPointerDown(event: PointerEvent, colIndex: number, colWidth: number): void {
    this.headerPointerDown.emit({ colIndex, colWidth, colHeight: this.headerHeight(), event });
  }

  protected onFilterPointerDown(event: PointerEvent, colIndex: number): void {
    event.stopPropagation();
    const cell = (event.currentTarget as HTMLElement).closest('.gp-grid-header-cell') as HTMLElement | null;
    if (cell) {
      this.filterPointerDown.emit({ colIndex, anchorEl: cell });
    }
  }

  protected onResizePointerDown(event: PointerEvent, colIndex: number, colWidth: number): void {
    event.stopPropagation();
    this.resizePointerDown.emit({ colIndex, colWidth, event });
  }

  protected headerTemplate(column: ColumnDefinition): HeaderRendererTemplate | null {
    const renderer: unknown = column.headerRenderer;
    if (renderer instanceof TemplateRef) {
      return renderer as HeaderRendererTemplate;
    }
    if (typeof renderer === 'string') {
      const registered = this.headerRenderers()[renderer];
      if (registered) return registered;
    }
    return this.globalHeaderRenderer();
  }

  protected headerParams(
    column: ColumnDefinition,
    colIndex: number,
    headerData: HeaderData | undefined,
  ): HeaderRendererParams {
    const sortable = this.sortingEnabled() && column.sortable !== false;
    const filterable = column.filterable !== false;
    return {
      column,
      colIndex,
      sortDirection: headerData?.sortDirection,
      sortIndex: headerData?.sortIndex,
      sortable,
      filterable,
      hasFilter: headerData?.hasFilter ?? false,
      onSort: (direction, addToExisting) => {
        if (sortable) {
          const colId = column.colId ?? column.field;
          this.headerSort.emit({ colId, direction, addToExisting });
        }
      },
      onFilterClick: () => {
        // The anchor is looked up via data-col-index — same pattern as the default filter icon.
        // No-op here; consumers using a custom header template should use the exposed callback.
      },
    };
  }
}
