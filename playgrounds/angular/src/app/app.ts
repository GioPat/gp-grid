import { Component, signal, computed, effect, PLATFORM_ID, ViewChild, AfterViewInit, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isPlatformBrowser } from '@angular/common';
import { GpGridComponent, provideGridData, injectGridData } from '@gp-grid/angular';
import type {
  AngularColumnDefinition,
  CellRendererTemplate,
  EditRendererParams,
  EditRendererTemplate,
  HeaderRendererTemplate,
  HighlightingOptions,
  RowGroupingOptions,
} from '@gp-grid/angular';

interface Person {
  id: number;
  name: string;
  age: number;
  city: string;
}

const NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
const CITIES = ['New York', 'London', 'Paris', 'Tokyo', 'Berlin', 'Rome', 'Sydney', 'Toronto'];

interface GroupableColumn {
  field: keyof Person;
  label: string;
}

const generateRows = (count: number): Person[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: NAMES[i % NAMES.length],
    age: 20 + (i % 50),
    city: CITIES[i % CITIES.length],
  }));

@Component({
  selector: 'app-root',
  imports: [GpGridComponent, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  providers: [
    provideGridData<Person>({
      getRowId: (row) => row.id,
      initialData: generateRows(1_500_000),
    }),
  ],
})
export class App implements AfterViewInit {
  protected darkMode = signal(false);
  protected groupingEnabled = signal(true);
  protected selectedGroupColumns = signal<Array<keyof Person>>(['city']);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('ageBadge', { static: true }) ageBadge!: CellRendererTemplate;
  @ViewChild('cityHeader', { static: true }) cityHeader!: HeaderRendererTemplate;
  @ViewChild('cityEditor', { static: true }) cityEditor!: EditRendererTemplate;

  protected readonly cityOptions = CITIES;
  protected readonly groupableColumns: GroupableColumn[] = [
    { field: 'name', label: 'Name' },
    { field: 'age', label: 'Age' },
    { field: 'city', label: 'City' },
  ];

  protected readonly grid = injectGridData<Person>();

  protected rowIdToUpdate = signal(1);
  protected rowGrouping = computed<RowGroupingOptions>(() => {
    const columns = this.selectedGroupColumns();
    if (!this.groupingEnabled() || columns.length === 0) return { columns: [] };
    return {
      columns: columns.map(String),
      defaultExpandedDepth: 1,
    };
  });

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
      { field: 'city', cellDataType: 'text', headerName: 'City', width: 150, sortable: true, filterable: true, editable: true, headerRenderer: this.cityHeader, editRenderer: this.cityEditor, valueFormatter: (v) => `🏙 ${String(v ?? "")}` },
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

  protected isGroupColumnSelected(field: keyof Person): boolean {
    return this.selectedGroupColumns().includes(field);
  }

  protected onGroupColumnChange(field: keyof Person, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedGroupColumns.update((columns) => {
      if (checked && columns.includes(field) === false) {
        return [...columns, field];
      }
      if (checked) return columns;
      return columns.filter((column) => column !== field);
    });
  }

  protected updateRowRandom(): void {
    this.grid.updateRow(this.rowIdToUpdate(), {
      name: `Person ${NAMES[Math.floor(Math.random() * NAMES.length)]}`,
      age: 20 + Math.floor(Math.random() * 60),
      city: this.cityOptions[Math.floor(Math.random() * this.cityOptions.length)],
    });
  }

  protected toggleDarkMode(): void {
    this.darkMode.update(v => !v);
  }
}
