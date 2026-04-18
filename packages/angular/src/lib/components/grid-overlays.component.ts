import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type {
  CellValue,
  ColumnDefinition,
  ColumnFilterModel,
  DragState,
  VisibleColumnInfo,
} from '@gp-grid/core';
import { FilterPopupComponent } from './filter-popup.component';

export interface ActiveFilterPopup {
  colIndex: number;
  column: ColumnDefinition;
  distinctValues: CellValue[];
  currentFilter?: ColumnFilterModel;
  anchorEl: HTMLElement | null;
}

const TEMPLATE = `
  @if (filterPopup(); as fp) {
    <gp-grid-filter-popup
      [column]="fp.column"
      [colIndex]="fp.colIndex"
      [anchorEl]="fp.anchorEl!"
      [distinctValues]="fp.distinctValues"
      [currentFilter]="fp.currentFilter"
      (apply)="filterApply.emit($event)"
      (close)="filterClose.emit()"
    />
  }
  @if (isResizing()) {
    <div class="gp-grid-column-resize-line" [style.left.px]="resizeLineLeft()"></div>
  }
  @if (isLoading()) {
    <div
      style="position: absolute; left: 0; right: 0; bottom: 0; z-index: 50; pointer-events: none;"
      [style.top.px]="headerHeight()">
      <div class="gp-grid-loading-overlay"></div>
      <div class="gp-grid-loading">
        <div class="gp-grid-loading-spinner"></div>
      </div>
    </div>
  }
  @if (errorMessage(); as msg) {
    <div class="gp-grid-error">Error: {{ msg }}</div>
  }
  @if (columnMove(); as cm) {
    <div
      class="gp-grid-column-move-ghost"
      [style.left.px]="cm.currentX - cm.ghostWidth / 2"
      [style.top.px]="cm.currentY - cm.ghostHeight / 2"
      [style.width.px]="cm.ghostWidth"
      [style.height.px]="cm.ghostHeight">
      {{ columnMoveGhostText() }}
    </div>
    @if (columnMoveDropLeft() !== null) {
      <div
        class="gp-grid-column-drop-indicator"
        [style.left.px]="columnMoveDropLeft()"
        [style.height.px]="headerHeight()"></div>
    }
  }
  @if (rowDragGhost(); as rd) {
    <div
      class="gp-grid-row-drag-ghost"
      [style.left.px]="rd.currentX + 12"
      [style.top.px]="rd.currentY - rowHeight() / 2"
      [style.width.px]="rowDragGhostWidth()"
      [style.height.px]="rowHeight()"></div>
  }
`;

@Component({
  selector: 'gp-grid-overlays',
  standalone: true,
  imports: [FilterPopupComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: TEMPLATE,
})
export class GridOverlaysComponent {
  filterPopup = input<ActiveFilterPopup | null>(null);
  isLoading = input<boolean>(false);
  errorMessage = input<string | null>(null);
  headerHeight = input.required<number>();
  rowHeight = input.required<number>();
  dragState = input.required<DragState>();
  visibleColumnWithIndices = input.required<VisibleColumnInfo[]>();
  columnPositions = input.required<number[]>();
  scrollLeft = input.required<number>();
  effectiveColumns = input.required<ColumnDefinition[]>();
  totalWidth = input.required<number>();

  filterApply = output<{ colId: string; filter: ColumnFilterModel | null }>();
  filterClose = output<void>();

  protected isResizing = computed(() => this.dragState().dragType === 'column-resize');

  protected resizeLineLeft = computed<number>(() => {
    const cr = this.dragState().columnResize;
    if (cr === null) return 0;
    const visibleIndex = this.visibleColumnWithIndices().findIndex(
      v => v.originalIndex === cr.colIndex
    );
    if (visibleIndex === -1) return 0;
    const positions = this.columnPositions();
    return (positions[visibleIndex] ?? 0) + cr.currentWidth - this.scrollLeft();
  });

  protected columnMove = computed(() => {
    if (this.dragState().dragType !== 'column-move') return null;
    return this.dragState().columnMove;
  });

  protected rowDragGhost = computed(() => {
    if (this.dragState().dragType !== 'row-drag') return null;
    return this.dragState().rowDrag;
  });

  protected columnMoveGhostText = computed<string>(() => {
    const cm = this.columnMove();
    if (cm === null) return '';
    const column = this.effectiveColumns()[cm.sourceColIndex];
    return column?.headerName ?? column?.field ?? '';
  });

  protected columnMoveDropLeft = computed<number | null>(() => {
    const cm = this.columnMove();
    if (cm === null || cm.dropTargetIndex === null) return null;
    const positions = this.columnPositions();
    return (positions[cm.dropTargetIndex] ?? 0) - this.scrollLeft();
  });

  protected rowDragGhostWidth = computed<number>(() => Math.min(300, this.totalWidth()));
}
