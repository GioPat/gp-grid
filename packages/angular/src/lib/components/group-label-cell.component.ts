import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { HierarchyGroupRow, HierarchyTotalRow } from '@gp-grid/core';
import { groupLabelParams } from './row-group-cells';
import type { RowGroupCellContext } from './row-group-cells';

/**
 * The expander of a group or total row's label cell. Attribute selectors keep
 * the DOM of the other wrappers: the expander and the label are the cell's children.
 */
@Component({
  selector: 'span[gpGridGroupToggle]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    class: 'gp-grid-group-toggle',
    'aria-hidden': 'true',
    '[class.gp-grid-group-toggle--expanded]': 'expanded()',
    '[class.gp-grid-group-toggle--none]': 'isTotal()',
    '(pointerdown)': 'onPointerDown($event)',
    '(dblclick)': 'onDoubleClick($event)',
  },
})
export class GroupToggleComponent {
  row = input.required<HierarchyGroupRow | HierarchyTotalRow>();
  rowIndex = input.required<number>();
  context = input.required<RowGroupCellContext>();

  protected isTotal = computed(() => this.row().kind === 'total');

  protected expanded = computed(() => {
    const row = this.row();
    return row.kind === 'group' && row.expanded;
  });

  protected onPointerDown(event: PointerEvent): void {
    if (this.row().kind === 'group') this.context().onTogglePointerDown(this.rowIndex(), event);
  }

  // The cell's own double-click toggles too, so a double-click on the expander
  // must not reach it after its two pointer downs already toggled (D5).
  protected onDoubleClick(event: MouseEvent): void {
    event.stopPropagation();
  }
}

/** The label of a group or total row: the formatted text or `groupLabelRenderer`. */
@Component({
  selector: 'span[gpGridGroupLabel]',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'gp-grid-group-label' },
  template: `@if (context().renderer; as tpl) {<ng-container [ngTemplateOutlet]="tpl" [ngTemplateOutletContext]="{ $implicit: params() }" />} @else {<ng-container>{{ label() }}</ng-container>}`,
})
export class GroupLabelComponent {
  row = input.required<HierarchyGroupRow | HierarchyTotalRow>();
  rowIndex = input.required<number>();
  label = input.required<string>();
  context = input.required<RowGroupCellContext>();

  protected params = computed(() =>
    groupLabelParams(this.row(), this.rowIndex(), this.label(), this.context()));
}
