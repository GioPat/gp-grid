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
  ColumnWindowSnapshot,
  ResolvedColumn,
  ColumnDefinition,
  ColumnPin,
  GridLabels,
  GridIcon,
  HeaderRendererParams,
  SortDirection,
} from '@gp-grid/core';
import { defaultGridLabels, defaultPinIcon } from '@gp-grid/core';

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
    role="row"
    [style.height.px]="headerHeight()">
    <ng-template #headerCellTpl let-entry="entry">
      @let colW = entry.width;
      @let headerData = headers().get(entry.columnId);
      @let tpl = headerTemplate(entry.column);
      <div
        class="gp-grid-header-cell"
        role="columnheader"
        [attr.aria-colindex]="displayedIndexOf()(entry.columnId) + 1"
        [attr.data-col-index]="entry.layoutIndex"
        [attr.data-cell-region]="entry.region"
        [style.inset-inline-start.px]="entry.regionOffset"
        [style.width.px]="colW"
        [style.height.px]="headerHeight()"
        (pointerdown)="onHeaderPointerDown($event, entry.layoutIndex, colW)">
        @if (tpl) {
          <ng-container
            [ngTemplateOutlet]="tpl"
            [ngTemplateOutletContext]="{ $implicit: headerParams(entry.column, entry.layoutIndex, headerData) }">
          </ng-container>
        } @else {
          <button
            type="button"
            class="gp-grid-pin-button"
            [class.active]="entry.column.pinned"
            [attr.aria-label]="entry.column.pinned ? labels().unpinColumn : labels().pinColumn"
            [attr.aria-pressed]="entry.column.pinned ? 'true' : 'false'"
            [title]="entry.column.pinned ? labels().unpinColumn : labels().pinColumn"
            (pointerdown)="onPinPointerDown($event)"
            (click)="onPinClick($event, entry.columnId, entry.column.pinned ?? null)">
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              [attr.viewBox]="pinIcon().viewBox ?? '0 0 24 24'">
              <path [attr.d]="pinIcon().path" fill="currentColor"/>
            </svg>
          </button>
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
              (pointerdown)="onFilterPointerDown($event, entry.layoutIndex)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4h16l-6 8v5l-4 2v-7L4 4z"/>
              </svg>
            </span>
          }
        </span>
        @if (entry.column.resizable !== false) {
          <div
            class="gp-grid-header-resize-handle"
            (pointerdown)="onResizePointerDown($event, entry.layoutIndex, colW)">
          </div>
        }
      </div>
    </ng-template>
    <div
      style="position: absolute; top: 0; inset-inline-start: 0;"
      role="presentation"
      [style.transform]="transformStyle()"
      [style.width.px]="innerWidth()"
      [style.height.px]="headerHeight()">
      @for (entry of centerColumns(); track entry.columnId) {
        <ng-container
          [ngTemplateOutlet]="headerCellTpl"
          [ngTemplateOutletContext]="{ entry: entry }">
        </ng-container>
      }
    </div>
    @if (startColumns().length > 0) {
      <div
        class="gp-grid-pin-header"
        role="presentation"
        data-pin-region="start"
        style="inset-inline-start: 0;"
        [style.width.px]="startWidth()"
        [style.height.px]="headerHeight()">
        @for (entry of startColumns(); track entry.columnId) {
          <ng-container
            [ngTemplateOutlet]="headerCellTpl"
            [ngTemplateOutletContext]="{ entry: entry }">
          </ng-container>
        }
      </div>
    }
    @if (endColumns().length > 0) {
      <div
        class="gp-grid-pin-header"
        role="presentation"
        data-pin-region="end"
        [style.inset-inline-start.px]="endOffset()"
        [style.width.px]="endWidth()"
        [style.height.px]="headerHeight()">
        @for (entry of endColumns(); track entry.columnId) {
          <ng-container
            [ngTemplateOutlet]="headerCellTpl"
            [ngTemplateOutletContext]="{ entry: entry }">
          </ng-container>
        }
      </div>
    }
    @if (viewportWidth() > 0) {
      <div
        class="gp-grid-header-gutter"
        role="presentation"
        [style.inset-inline-start.px]="viewportWidth()"
        [style.height.px]="headerHeight()">
      </div>
    }
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
  /** DOM scroll offset (physical: negative in RTL); the strip negates it. */
  scrollLeft = input.required<number>();
  contentWidth = input.required<number>();
  totalWidth = input.required<number>();
  viewportWidth = input.required<number>();
  isLoading = input.required<boolean>();
  columnWindow = input.required<ColumnWindowSnapshot | null>();
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  displayedIndexOf = input<(columnId: string) => number>(() => 0);
  headers = input.required<Map<string, HeaderData>>();
  sortingEnabled = input<boolean>(true);
  labels = input<GridLabels>(defaultGridLabels);
  headerRenderers = input<Record<string, HeaderRendererTemplate>>({});
  globalHeaderRenderer = input<HeaderRendererTemplate | null>(null);
  pinIcon = input<GridIcon>(defaultPinIcon);

  headerPointerDown = output<HeaderPointerDownEvent>();
  filterPointerDown = output<FilterPointerDownEvent>();
  resizePointerDown = output<ResizePointerDownEvent>();
  headerSort = output<HeaderSortEvent>();
  headerPin = output<{ columnId: string; pinned: ColumnPin | null }>();
  headerFilterOpen = output<{ colIndex: number; anchorEl: HTMLElement }>();

  protected innerWidth = computed(() =>
    Math.max(this.contentWidth(), this.totalWidth())
  );

  /** Region partitions of the mounted column window; empty before it publishes. */
  protected startColumns = computed<readonly ResolvedColumn[]>(() => this.columnWindow()?.start ?? []);

  protected centerColumns = computed<readonly ResolvedColumn[]>(() => this.columnWindow()?.center ?? []);

  protected endColumns = computed<readonly ResolvedColumn[]>(() => this.columnWindow()?.end ?? []);

  protected startWidth = computed(() => this.columnWindow()?.layout.regions.startWidth ?? 0);

  protected endWidth = computed(() => this.columnWindow()?.layout.regions.endWidth ?? 0);

  protected endOffset = computed(() => this.columnWindow()?.layout.regions.endOffset ?? 0);

  protected transformStyle = computed(() =>
    `translateX(${-this.scrollLeft()}px)`
  );

  protected onPinPointerDown(event: PointerEvent): void {
    event.stopPropagation();
    event.preventDefault();
  }

  protected onPinClick(event: MouseEvent, columnId: string, pinned: ColumnPin | null): void {
    event.stopPropagation();
    this.headerPin.emit({ columnId, pinned: pinned === null ? 'start' : null });
  }

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
      columnId: column.colId ?? column.field,
      colIndex,
      sortDirection: headerData?.sortDirection,
      sortIndex: headerData?.sortIndex,
      sortable,
      filterable,
      hasFilter: headerData?.hasFilter ?? false,
      pinned: column.pinned ?? null,
      onSort: (direction, addToExisting) => {
        if (sortable) {
          const colId = column.colId ?? column.field;
          this.headerSort.emit({ colId, direction, addToExisting });
        }
      },
      onPinChange: (pinned) => this.headerPin.emit({ columnId: column.colId ?? column.field, pinned }),
      onFilterClick: () => {
        // The anchor is looked up via data-col-index — same pattern as the default filter icon.
        // No-op here; consumers using a custom header template should use the exposed callback.
      },
    };
  }
}
