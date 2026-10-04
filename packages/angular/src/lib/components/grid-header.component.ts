import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  inject,
  TemplateRef,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import type {
  HeaderData,
  ColumnWindowSnapshot,
  ResolvedColumn,
  ColumnDefinition,
  ColumnGroupDefinition,
  ColumnGroupHeaderParams,
  ColumnPin,
  GridCore,
  GridLabels,
  GridIcon,
  HeaderAssociations,
  HeaderBandLayout,
  HeaderBox,
  HeaderFragment,
  HeaderRendererParams,
  ResizeTarget,
  SortDirection,
} from '@gp-grid/core';
import {
  defaultGridLabels,
  defaultPinIcon,
  fragmentHeaderBox,
  fragmentHeaderId,
  leafHeaderBox,
  leafHeaderId,
  resolveHeaderAssociations,
} from '@gp-grid/core';
import { ResizeHandleComponent } from './resize-handle.component';
import type { ResizeHandlePointerDownEvent } from './resize-handle.component';
import { GRID_HEADER_TEMPLATE } from './grid-header.template';
import { GridHeaderInstanceIds } from './header-instance-ids';
import {
  NO_HEADER_FRAGMENTS,
  groupHeaderParams,
  leafHeaderBands,
  resolveGroupTemplate,
} from './grid-header-groups';
import type {
  GroupHeaderRendererTemplate,
  HeaderRendererRegistry,
  LeafHeaderBands,
} from './grid-header-groups';

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

@Component({
  selector: 'gp-grid-header',
  standalone: true,
  imports: [NgTemplateOutlet, ResizeHandleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: GRID_HEADER_TEMPLATE,
})
export class GridHeaderComponent {
  headerBands = input.required<HeaderBandLayout>();
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
  rtl = input<boolean>(false);
  labels = input<GridLabels>(defaultGridLabels);
  headerRenderers = input<HeaderRendererRegistry>({});
  globalHeaderRenderer = input<HeaderRendererTemplate | null>(null);
  pinIcon = input<GridIcon>(defaultPinIcon);
  /** Resolves a fragment's group definition; `null` before the core exists. */
  core = input<GridCore<unknown> | null>(null);

  headerPointerDown = output<HeaderPointerDownEvent>();
  filterPointerDown = output<FilterPointerDownEvent>();
  resizePointerDown = output<ResizePointerDownEvent>();
  resizeDoubleClick = output<ResizeTarget>();
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

  private readonly instance = inject(GridHeaderInstanceIds).next();

  protected totalHeight = computed(() => this.headerBands().totalHeight);

  protected groups = computed(() => this.columnWindow()?.groups ?? NO_HEADER_FRAGMENTS);

  /** Grouped mode: present while the header has more than one band. */
  protected associations = computed<HeaderAssociations | null>(() => {
    const columnWindow = this.columnWindow();
    const bandCount = this.headerBands().count;
    if (columnWindow === null || bandCount <= 1) return null;
    return resolveHeaderAssociations({
      instance: this.instance,
      columnWindow,
      bandCount,
      displayedIndexOf: this.displayedIndexOf(),
    });
  });

  protected rootRole = computed(() => (this.associations() === null ? 'row' : 'rowgroup'));

  protected rootRowIndex = computed(() => (this.associations() === null ? 1 : null));

  protected leafId(columnId: string): string {
    return leafHeaderId(this.instance, columnId);
  }

  protected leafBox(headerBand: number): HeaderBox {
    return leafHeaderBox(this.headerBands(), headerBand);
  }

  protected leafBands(column: ResolvedColumn): LeafHeaderBands | null {
    return leafHeaderBands(this.associations(), this.headerBands().count, column);
  }

  protected fragmentId(fragmentId: string): string {
    return fragmentHeaderId(this.instance, fragmentId);
  }

  protected fragmentBox(band: number): HeaderBox {
    return fragmentHeaderBox(this.headerBands(), band);
  }

  protected groupOf(groupId: string): ColumnGroupDefinition | undefined {
    return this.core()?.columns.getGroup(groupId);
  }

  protected groupTemplate(group: ColumnGroupDefinition | undefined): GroupHeaderRendererTemplate | null {
    return resolveGroupTemplate(group, this.headerRenderers());
  }

  protected groupParams(fragment: HeaderFragment, group: ColumnGroupDefinition): ColumnGroupHeaderParams {
    return groupHeaderParams(fragment, group, this.columnWindow()?.layout.columns ?? []);
  }

  protected onPinPointerDown(event: PointerEvent): void {
    event.stopPropagation();
    event.preventDefault();
  }

  protected onPinClick(event: MouseEvent, columnId: string, pinned: ColumnPin | null): void {
    event.stopPropagation();
    this.headerPin.emit({ columnId, pinned: this.nextPin(pinned) });
  }

  protected nextPinLabel(pinned: ColumnPin | null): string {
    const left: ColumnPin = this.rtl() ? 'end' : 'start';
    if (pinned === null) return this.labels().pinLeftColumn;
    if (pinned === left) return this.labels().pinRightColumn;
    return this.labels().unpinColumn;
  }

  private nextPin(pinned: ColumnPin | null): ColumnPin | null {
    const left: ColumnPin = this.rtl() ? 'end' : 'start';
    const right: ColumnPin = this.rtl() ? 'start' : 'end';
    if (pinned === null) return left;
    if (pinned === left) return right;
    return null;
  }

  protected onHeaderPointerDown(
    event: PointerEvent,
    colIndex: number,
    colWidth: number,
    colHeight: number,
  ): void {
    this.headerPointerDown.emit({ colIndex, colWidth, colHeight, event });
  }

  protected onFilterPointerDown(event: PointerEvent, colIndex: number): void {
    event.stopPropagation();
    const cell = (event.currentTarget as HTMLElement).closest('.gp-grid-header-cell') as HTMLElement | null;
    if (cell) {
      this.filterPointerDown.emit({ colIndex, anchorEl: cell });
    }
  }

  protected onResizePointerDown(evt: ResizeHandlePointerDownEvent): void {
    this.resizePointerDown.emit({ colIndex: evt.index, colWidth: evt.size, event: evt.event });
  }

  protected headerTemplate(column: ColumnDefinition): HeaderRendererTemplate | null {
    const renderer: unknown = column.headerRenderer;
    if (renderer instanceof TemplateRef) {
      return renderer as HeaderRendererTemplate;
    }
    if (typeof renderer === 'string') {
      const registered = this.headerRenderers()[renderer] as HeaderRendererTemplate | undefined;
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
