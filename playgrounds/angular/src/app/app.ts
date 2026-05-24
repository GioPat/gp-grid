import { Component, signal, effect, PLATFORM_ID, ViewChild, AfterViewInit, ChangeDetectorRef, inject } from '@angular/core';
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
} from '@gp-grid/angular';

interface Person {
  id: number;
  name: string;
  age: number;
  city: string;
  bio: string;
  createdAt: Date;
}

const NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
const CITIES = ['New York', 'London', 'Paris', 'Tokyo', 'Berlin', 'Rome', 'Sydney', 'Toronto'];

// Long bio strings pooled so the 1.5M-row dataset doesn't allocate millions of
// distinct strings. Each row references one of these by index modulo.
const BIOS: string[] = [
  "Seasoned backend engineer who spent the last decade chasing tail-latency outliers across distributed message brokers. Mentors junior engineers, writes too many internal docs, and is on a quiet mission to retire every YAML file in the company.",
  "Joined fresh out of a bootcamp three years ago and now leads the design system working group. Holds strong opinions about color tokens, accessible focus rings, and the perfect motion duration (always 180ms, never 200).",
  "Former data scientist turned product manager. Still keeps a Jupyter notebook open on the side. Argues that every roadmap should start with a histogram and end with a follow-up question.",
  "Lives in three time zones and is somehow always the first to reply on Slack. Hobbies include long walks, longer postmortems, and convincing reviewers that this PR is, in fact, small.",
  "Joined for the coffee, stayed for the codebase. Has opinions on monorepos, file organization, and whether `index.ts` should be allowed to re-export anything at all (it should not).",
  "Quietly rewrote the deployment pipeline over a long weekend and never told anyone — found out three months later when the on-call rotation noticed the alert volume had dropped by 80%.",
];

// Date pool: small set of timestamps reused across rows to keep memory flat.
const DATES: Date[] = Array.from(
  { length: 60 },
  (_, i) => new Date(Date.now() - i * 86400000 * 5),
);

const generateRows = (count: number): Person[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: NAMES[i % NAMES.length],
    age: 20 + (i % 50),
    city: CITIES[i % CITIES.length],
    bio: BIOS[i % BIOS.length],
    createdAt: DATES[i % DATES.length],
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

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('ageBadge', { static: true }) ageBadge!: CellRendererTemplate;
  @ViewChild('cityHeader', { static: true }) cityHeader!: HeaderRendererTemplate;
  @ViewChild('cityEditor', { static: true }) cityEditor!: EditRendererTemplate;

  protected readonly cityOptions = CITIES;

  protected readonly grid = injectGridData<Person>();

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
      { field: 'city', cellDataType: 'text', headerName: 'City', width: 150, sortable: true, filterable: true, editable: true, headerRenderer: this.cityHeader, editRenderer: this.cityEditor, valueFormatter: (v) => `🏙 ${String(v ?? "")}` },
      // Long text column — not editable so double-click opens the read-only
      // peek overlay (once the Angular wrapper renders one — currently behaviour-only).
      { field: 'bio', cellDataType: 'text', headerName: 'Bio', width: 260, sortable: true, filterable: true, distinctValues: BIOS },
      { field: 'createdAt', cellDataType: 'dateTime', headerName: 'Created', width: 200, sortable: true, filterable: true, valueFormatter: (v) => (v instanceof Date ? v.toLocaleString() : '') },
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
