import { Component, signal, effect, PLATFORM_ID, ViewChild, AfterViewInit, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isPlatformBrowser } from '@angular/common';
import { GpGridComponent, createGridData } from '@gp-grid/angular';
import type {
  AngularColumnDefinition,
  CellRendererTemplate,
  EditRendererParams,
  EditRendererTemplate,
  HeaderRendererTemplate,
  HighlightingOptions,
} from '@gp-grid/angular';

interface Person {
  id: number;
  name: string;
  age: number;
  city: string;
}

@Component({
  selector: 'app-root',
  imports: [GpGridComponent, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit {
  protected darkMode = signal(false);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('ageBadge', { static: true }) ageBadge!: CellRendererTemplate;
  @ViewChild('cityHeader', { static: true }) cityHeader!: HeaderRendererTemplate;
  @ViewChild('cityEditor', { static: true }) cityEditor!: EditRendererTemplate;

  protected readonly cityOptions = ['New York', 'London', 'Paris', 'Tokyo', 'Berlin', 'Rome', 'Sydney', 'Toronto'];

  protected readonly grid = createGridData<Person>(App.generateRows(1_500_000), {
    getRowId: (row) => row.id,
  });

  protected rowIdToUpdate = signal(1);

  columns: AngularColumnDefinition[] = [];

  highlighting: HighlightingOptions = {
    computeRowClasses: (ctx) => (ctx.isHovered ? ['pg-row--hover'] : []),
    computeColumnClasses: (ctx) => (ctx.isHovered ? ['pg-col--hover'] : []),
  };

  constructor() {
    effect(() => {
      if (!this.isBrowser) return;
      document.documentElement.classList.toggle('dark', this.darkMode());
    });
  }

  ngAfterViewInit(): void {
    this.columns = [
      { field: 'id', cellDataType: 'number', headerName: 'ID', width: 80, sortable: true },
      { field: 'name', cellDataType: 'text', headerName: 'Name', width: 200, sortable: true, filterable: true, editable: true },
      { field: 'age', cellDataType: 'number', headerName: 'Age', width: 100, sortable: true, filterable: true, cellRenderer: this.ageBadge },
      { field: 'city', cellDataType: 'text', headerName: 'City', width: 150, sortable: true, filterable: true, editable: true, headerRenderer: this.cityHeader, editRenderer: this.cityEditor },
    ];
    this.cdr.detectChanges();
  }

  protected ageTone(value: number): string {
    if (value < 30) return 'young';
    if (value < 50) return 'mid';
    return 'senior';
  }

  protected onCityEditChange(event: Event, params: EditRendererParams): void {
    const value = (event.target as HTMLSelectElement).value;
    params.onValueChange(value);
    params.onCommit();
  }

  protected onCityEditKeyDown(event: KeyboardEvent, params: EditRendererParams): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      params.onCancel();
    } else if (event.key === 'Enter') {
      params.onCommit();
    }
  }

  protected onRowDragEnd(event: { source: number; target: number }): void {
    console.log(`Row drag: ${event.source} → ${event.target}`);
  }

  protected updateRowRandom(): void {
    const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
    this.grid.updateRow(this.rowIdToUpdate(), {
      name: `Person ${names[Math.floor(Math.random() * names.length)]}`,
      age: 20 + Math.floor(Math.random() * 60),
      city: this.cityOptions[Math.floor(Math.random() * this.cityOptions.length)],
    });
  }

  protected toggleDarkMode(): void {
    this.darkMode.update(v => !v);
  }

  private static generateRows(count: number): Person[] {
    const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
    const cities = ['New York', 'London', 'Paris', 'Tokyo', 'Berlin', 'Rome', 'Sydney', 'Toronto'];
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: names[i % names.length],
      age: 20 + (i % 50),
      city: cities[i % cities.length],
    }));
  }
}
