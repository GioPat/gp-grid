import { Component, signal } from '@angular/core';
import { GpGridComponent } from '@gp-grid/angular';
import type { AngularColumnDefinition, CellValueChangedEvent } from '@gp-grid/angular';

interface ConformanceRow {
  id: number;
  name: string;
  city: string;
  score: number;
  team: string;
  status: string;
  note: string;
  code: string;
}

const createRows = (): ConformanceRow[] => Array.from({ length: 200 }, (_, index) => ({
  id: index,
  name: `Row ${index.toString().padStart(3, '0')}`,
  city: `City ${index % 11}`,
  score: index * 3,
  team: `Team ${index % 7}`,
  status: index % 2 === 0 ? 'active' : 'inactive',
  note: `Note ${index}`,
  code: `C-${index.toString().padStart(4, '0')}`,
}));

const createColumns = (): AngularColumnDefinition[] => [
  { colId: 'id', field: 'id', headerName: 'ID', width: 90, cellDataType: 'number', sortable: true },
  { colId: 'name', field: 'name', headerName: 'Name', width: 180, cellDataType: 'text', sortable: true, filterable: true, editable: true },
  { colId: 'city', field: 'city', headerName: 'City', width: 140, cellDataType: 'text' },
  { colId: 'score', field: 'score', headerName: 'Score', width: 120, cellDataType: 'number' },
  { colId: 'team', field: 'team', headerName: 'Team', width: 150, cellDataType: 'text' },
  { colId: 'status', field: 'status', headerName: 'Status', width: 130, cellDataType: 'text' },
  { colId: 'note', field: 'note', headerName: 'Note', width: 210, cellDataType: 'text' },
  { colId: 'code', field: 'code', headerName: 'Code', width: 160, cellDataType: 'text' },
];

@Component({
  selector: 'app-root',
  imports: [GpGridComponent],
  template: `
    <main data-conformance-framework="angular" style="width: 620px; margin: 16px">
      <div style="display: flex; gap: 8px; margin-bottom: 8px">
        <button data-testid="reset" (click)="reset()">Reset</button>
        <button data-testid="remount" (click)="remount()">Remount</button>
        <button data-testid="replace-columns" (click)="replaceColumns()">Replace columns</button>
        <output data-testid="metrics">{{ metrics() }}</output>
      </div>
      <div data-testid="grid-host" style="width: 600px; height: 360px">
        @if (mounted()) {
          <gp-grid
            [columns]="columns()"
            [rows]="rows()"
            [rowHeight]="32"
            [headerHeight]="36"
            [getRowId]="getRowId"
            (onCellValueChanged)="onCellValueChanged($event)" />
        }
      </div>
    </main>
  `,
})
export class ConformanceApp {
  protected readonly rows = signal<ConformanceRow[]>(createRows());
  protected readonly columns = signal<AngularColumnDefinition[]>(createColumns());
  protected readonly mounted = signal(true);
  protected readonly generation = signal(0);
  protected readonly editEvents = signal(0);
  protected readonly metrics = () => JSON.stringify({ generation: this.generation(), editEvents: this.editEvents() });
  protected readonly getRowId = (row: unknown): number => (row as ConformanceRow).id;

  protected replaceColumns(): void {
    this.columns.set([
      { colId: 'score', field: 'score', headerName: 'Score', width: 120, cellDataType: 'number' },
      { colId: 'city', field: 'city', headerName: 'City', width: 140, cellDataType: 'text' },
      { colId: 'replacement', field: 'code', headerName: 'Replacement', width: 190, cellDataType: 'text' },
    ]);
  }

  protected reset(): void {
    this.mounted.set(false);
    this.rows.set(createRows());
    this.columns.set(createColumns());
    this.editEvents.set(0);
    window.setTimeout(() => {
      this.generation.update((value) => value + 1);
      this.mounted.set(true);
    }, 0);
  }

  protected remount(): void {
    this.mounted.set(false);
    window.setTimeout(() => {
      this.generation.update((value) => value + 1);
      this.mounted.set(true);
    }, 0);
  }

  protected onCellValueChanged(event: CellValueChangedEvent<unknown>): void {
    this.rows.update((rows) => rows.map((row) => row.id === event.rowId ? { ...row, [event.field]: event.newValue } : row));
    this.editEvents.update((value) => value + 1);
  }
}
