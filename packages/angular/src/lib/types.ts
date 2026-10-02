import type { TemplateRef } from '@angular/core';
import type {
  ColumnDefinition,
  ColumnGroupDefinition,
  ColumnGroupHeaderParams,
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,
} from '@gp-grid/core';

/**
 * Column definition extended for Angular — allows `cellRenderer`,
 * `editRenderer`, and `headerRenderer` to be passed directly as
 * `TemplateRef` references in addition to the core's string-key / function
 * forms.
 */
export interface AngularColumnDefinition extends Omit<ColumnDefinition, 'cellRenderer' | 'editRenderer' | 'headerRenderer'> {
  cellRenderer?:
    | string
    | TemplateRef<{ $implicit: CellRendererParams }>
    | ((params: CellRendererParams) => unknown);
  editRenderer?:
    | string
    | TemplateRef<{ $implicit: EditRendererParams }>
    | ((params: EditRendererParams) => unknown);
  headerRenderer?:
    | string
    | TemplateRef<{ $implicit: HeaderRendererParams }>
    | ((params: HeaderRendererParams) => unknown);
}

/**
 * Column group extended for Angular: `headerRenderer` also takes a
 * `TemplateRef`, which receives the fragment's `ColumnGroupHeaderParams`.
 */
export interface AngularColumnGroupDefinition extends Omit<ColumnGroupDefinition, 'headerRenderer' | 'children'> {
  headerRenderer?:
    | string
    | TemplateRef<{ $implicit: ColumnGroupHeaderParams }>
    | ((params: ColumnGroupHeaderParams) => unknown);
  children: readonly AngularColumnGroupChild[];
}

/** A nested Angular group, or a leaf `ColumnId`. */
export type AngularColumnGroupChild = AngularColumnGroupDefinition | string;
