import { ChangeDetectionStrategy, Component, computed, ElementRef, input, output, TemplateRef, ViewChild } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import {
  formatCellValue,
  getFieldValue,
  buildCellClasses,
  isCellActive,
  isCellEditing,
  isCellInFillPreview,
  isCellSelected,
  SlotData,
  VisibleColumnInfo,
  CellPosition,
  CellRange,
  CellValue,
  ColumnDefinition,
  CellRendererParams,
  EditRendererParams,
  FillHandlePosition,
  DragState,
} from "@gp-grid/core";
import { GRID_BODY_TEMPLATE } from "./grid-body.template";

export type RowClassFn = (rowIndex: number, rowData: unknown) => string[];
export type CellClassFn = (
  rowIndex: number,
  colIndex: number,
  column: ColumnDefinition,
  rowData: unknown,
) => string[];

export type CellRendererTemplate = TemplateRef<{ $implicit: CellRendererParams }>;
export type EditRendererTemplate = TemplateRef<{ $implicit: EditRendererParams }>;

export interface FillHandlePointerDownEvent {
  event: PointerEvent;
}

export interface CellPointerDownEvent {
  rowIndex: number;
  colIndex: number;
  event: PointerEvent;
}

export interface CellPointerEnterEvent {
  rowIndex: number;
  colIndex: number;
}

export interface CellDoubleClickEvent {
  rowIndex: number;
  colIndex: number;
}

export interface EditingCellState {
  row: number;
  col: number;
  initialValue: CellValue;
}

@Component({
  selector: "gp-grid-body",
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`:host { display: flex; flex: 1; min-height: 0; overflow: hidden; }`],
  template: GRID_BODY_TEMPLATE,
})
export class GridBodyComponent {
  @ViewChild("scrollContainer") scrollContainer!: ElementRef<HTMLDivElement>;
  rowHeight = input.required<number>();
  totalHeaderHeight = input.required<number>();
  contentWidth = input.required<number>();
  contentHeight = input.required<number>();
  rowsWrapperOffset = input.required<number>();
  slotsArray = input.required<SlotData[]>();
  visibleColumnWithIndices = input.required<VisibleColumnInfo[]>();
  totalWidth = input.required<number>();
  columnPositions = input.required<number[]>();
  columnWidths = input.required<number[]>();
  totalRows = input.required<number>();
  activeCell = input<CellPosition | null>(null);
  selectionRange = input<CellRange | null>(null);
  editingCell = input<EditingCellState | null>(null);
  cellRenderers = input<Record<string, CellRendererTemplate>>({});
  globalCellRenderer = input<CellRendererTemplate | null>(null);
  editRenderers = input<Record<string, EditRendererTemplate>>({});
  globalEditRenderer = input<EditRendererTemplate | null>(null);
  hoverPosition = input<CellPosition | null>(null);
  computeRowClasses = input<RowClassFn | null>(null);
  computeCellClasses = input<CellClassFn | null>(null);
  fillHandlePosition = input<FillHandlePosition | null>(null);
  dragState = input<DragState | null>(null);

  scrolled = output<number>();
  cellPointerDown = output<CellPointerDownEvent>();
  cellPointerEnter = output<CellPointerEnterEvent>();
  cellPointerLeave = output<void>();
  cellDoubleClick = output<CellDoubleClickEvent>();
  editValueChange = output<string>();
  editCommit = output<void>();
  editCancel = output<void>();
  fillHandlePointerDown = output<FillHandlePointerDownEvent>();

  protected innerWidth = computed(() =>
    Math.max(this.contentWidth(), this.totalWidth()),
  );

  protected sizerHeight = computed(() =>
    Math.max(this.contentHeight() - this.totalHeaderHeight(), 0),
  );

  protected rowDropIndicator = computed(() => {
    const ds = this.dragState();
    if (ds?.dragType !== 'row-drag') return null;
    if (ds.rowDrag === null || ds.rowDrag.dropTargetIndex === null) return null;
    return ds.rowDrag;
  });

  protected rowDropIndicatorWidth = computed(() =>
    Math.max(this.contentWidth(), this.totalWidth()),
  );

  protected wrapperTransform = computed(() =>
    `translateY(${this.rowsWrapperOffset()}px)`);

  protected onScroll(): void {
    const el = this.scrollContainer.nativeElement;
    this.scrolled.emit(el.scrollLeft);
  }

  protected cellParams(
    rowData: unknown,
    column: ColumnDefinition,
    rowIndex: number,
    colIndex: number,
  ): CellRendererParams {
    return {
      value: getFieldValue(rowData, column.field),
      rowData,
      column,
      rowIndex,
      colIndex,
      isActive: isCellActive(rowIndex, colIndex, this.activeCell()),
      isSelected: isCellSelected(rowIndex, colIndex, this.selectionRange()),
      isEditing: false,
    };
  }

  protected cellTemplate(column: ColumnDefinition): CellRendererTemplate | null {
    const renderer: unknown = column.cellRenderer;
    if (renderer instanceof TemplateRef) {
      return renderer as CellRendererTemplate;
    }
    if (typeof renderer === 'string') {
      const registered = this.cellRenderers()[renderer];
      if (registered) return registered;
    }
    return this.globalCellRenderer();
  }

  protected editTemplate(column: ColumnDefinition): EditRendererTemplate | null {
    const renderer: unknown = (column as { editRenderer?: unknown }).editRenderer;
    if (renderer instanceof TemplateRef) {
      return renderer as EditRendererTemplate;
    }
    if (typeof renderer === 'string') {
      const registered = this.editRenderers()[renderer];
      if (registered) return registered;
    }
    return this.globalEditRenderer();
  }

  protected editParams(
    rowData: unknown,
    column: ColumnDefinition,
    rowIndex: number,
    colIndex: number,
  ): EditRendererParams {
    const ec = this.editingCell();
    return {
      value: getFieldValue(rowData, column.field),
      rowData,
      column,
      rowIndex,
      colIndex,
      isActive: true,
      isSelected: true,
      isEditing: true,
      initialValue: ec?.initialValue ?? null,
      onValueChange: (newValue) => {
        const s = newValue === null || newValue === undefined ? '' : String(newValue);
        this.editValueChange.emit(s);
      },
      onCommit: () => this.editCommit.emit(),
      onCancel: () => this.editCancel.emit(),
    };
  }

  protected cellDisplay(
    rowData: unknown,
    column: ColumnDefinition,
    rowIndex: number,
    colIndex: number,
  ): string {
    const renderer = column.cellRenderer;
    const value = getFieldValue(rowData, column.field);
    if (typeof renderer === 'function') {
      const params = this.cellParams(rowData, column, rowIndex, colIndex);
      const result = renderer(params);
      return result === null || result === undefined ? '' : String(result);
    }
    return formatCellValue(value, column.valueFormatter);
  }

  protected cellClass(
    rowIndex: number,
    colIndex: number,
    column: ColumnDefinition,
    rowData: unknown,
  ): string {
    const editingCell = this.editingCell();
    // Read hoverPosition to register this signal as a dep so Angular re-renders on hover change.
    this.hoverPosition();
    const ds = this.dragState();
    const inFillPreview = isCellInFillPreview(
      rowIndex,
      colIndex,
      ds?.dragType === "fill",
      ds?.fillSourceRange ?? null,
      ds?.fillTarget ?? null,
    );
    const base = buildCellClasses(
      isCellActive(rowIndex, colIndex, this.activeCell()),
      isCellSelected(rowIndex, colIndex, this.selectionRange()),
      isCellEditing(rowIndex, colIndex, editingCell),
      inFillPreview,
    );
    const withHandle = column.rowDrag === true
      ? `${base} gp-grid-cell--row-drag-handle`
      : base;
    const fn = this.computeCellClasses();
    if (fn === null) return withHandle;
    const extra = fn(rowIndex, colIndex, column, rowData);
    if (extra.length === 0) return withHandle;
    return `${withHandle} ${extra.join(' ')}`;
  }

  protected rowClass(rowIndex: number, rowData: unknown): string {
    this.hoverPosition();
    const fn = this.computeRowClasses();
    if (fn === null) return 'gp-grid-row';
    const extra = fn(rowIndex, rowData);
    if (extra.length === 0) return 'gp-grid-row';
    return `gp-grid-row ${extra.join(' ')}`;
  }

  protected isEditing(rowIndex: number, colIndex: number): boolean {
    return isCellEditing(rowIndex, colIndex, this.editingCell());
  }

  protected editInitialValue(): string {
    const ec = this.editingCell();
    if (ec === null || ec.initialValue === null || ec.initialValue === undefined) return '';
    return String(ec.initialValue);
  }

  protected asInput(event: Event): HTMLInputElement {
    return event.target as HTMLInputElement;
  }

  protected onEditFocus(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }

  protected onEditKeyDown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter') {
      this.editCommit.emit();
    } else if (event.key === 'Escape') {
      this.editCancel.emit();
    }
  }
}
