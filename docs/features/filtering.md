# Filtering

GP-Grid provides type-aware filtering with a popup-based UI.

## Per-Column Filtering

Control filtering for each column:

```tsx
const columns = [
  { field: 'id', cellDataType: 'number', width: 80, filterable: false },
  { field: 'name', cellDataType: 'text', width: 200, filterable: true },
  { field: 'price', cellDataType: 'number', width: 100 }, // filterable by default
];
```

## Filter Icon

Filterable columns display a funnel icon in the header. Click it to open the filter popup.

- **No filter**: Icon dimmed
- **Active filter**: Icon highlighted (blue)

## Filter Types

### Text Filter

For `text` and `object` column types:

- Search input to filter the list
- "Select All" / "Deselect All" buttons
- Checkbox list of distinct values from the data
- "(Blanks)" option for null/empty values

### Number Filter

For `number` column type. Operators:

| Operator | Display | Description |
|----------|---------|-------------|
| `=` | Equals | Equal to |
| `!=` | Does not equal | Not equal to |
| `>` | Greater than | Greater than |
| `<` | Less than | Less than |
| `>=` | Greater than or equal | Greater or equal |
| `<=` | Less than or equal | Less or equal |
| `between` | Between | Between two values |
| `blank` | Is blank | Null/undefined values |
| `notBlank` | Is not blank | Non-null values |

### Date Filter

For `date`, `dateString`, `dateTime`, `dateTimeString` column types. Same operators as number (except >= and <=).

## Multiple Conditions

Conditions are composed in explicit group cards. Each group has one AND/OR
operator for its conditions, and the column filter has a second AND/OR
operator between groups. This makes the grouping visible and lets the two
expressions below produce different models:

```
(Condition 1 AND Condition 2) OR Condition 3
Condition 1 AND (Condition 2 OR Condition 3)
```

Use **Add condition** inside a card and **Add group** below the cards. Empty
conditions and groups are discarded when the filter is applied.
Each AND/OR selector is displayed once for the level it controls: outside the
cards for groups, and inside a card for that card's conditions.

## Filter Model

The filter model structure:

```typescript
interface ColumnFilterModel {
  groups: FilterConditionGroup[];
  combination: 'and' | 'or'; // joins groups
}

interface FilterConditionGroup {
  conditions: FilterCondition[];
  combination: 'and' | 'or'; // joins conditions in this group
}

type FilterCondition =
  | TextFilterCondition
  | NumberFilterCondition
  | DateFilterCondition;

// Text filter
interface TextFilterCondition {
  type: 'text';
  operator: TextFilterOperator;
  value?: string;
  selectedValues?: Set<CellValue>;
  includeBlank?: boolean;
}
```

For example, `(A AND B) OR C` is represented as two groups:

```typescript
const filter: ColumnFilterModel = {
  groups: [
    { conditions: [A, B], combination: 'and' },
    { conditions: [C], combination: 'and' },
  ],
  combination: 'or',
};
```

### Migrating flat condition models

`GridCore.setFilter()` still accepts the previous flat model with
per-condition `nextOperator` values. It preserves the old left-to-right truth
table and immediately converts the input into equivalent one-level groups.
When a condition must appear in more than one group to preserve the expression,
the compact form with the fewest repeated conditions is selected.

Use `normalizeColumnFilterModel(legacyFilter)` to migrate stored filters
explicitly. `getFilterModel()` and `DataSourceRequest.filter` always return the
new grouped shape; server serializers must read `model.groups`.

### Values mode stores raw values

`selectedValues` holds **raw** cell values, never formatted labels. A
`valueFormatter` only affects what the filter popup displays: entries are
grouped by label, and ticking a label selects every raw value behind it.
Server-side data sources therefore receive raw values in
`request.filter` — adding a formatter never changes what is sent to the
server. When serializing a request for a server, convert the `Set` to an
array (`[...selectedValues]`); `JSON.stringify` on a `Set` produces `{}`.

Two caveats:

- When a formatter collapses many raw values into one label on a
  high-cardinality column, supply the full raw domain via
  `ColumnDefinition.distinctValues`. Values-mode filtering matches raw
  values, so raws the grid never discovered cannot be selected (the grid
  warns in the console when its distinct scan is truncated for a formatted
  column).
- Free-text condition operators (`contains`, `equals`, ...) still compare
  against the **formatted** value on client data sources — users type the
  text they see. A server backend matching the typed text against raw data
  may behave differently for formatted columns.

```typescript

// Number filter
interface NumberFilterCondition {
  type: 'number';
  operator: NumberFilterOperator;
  value?: number;
  valueTo?: number; // For 'between' operator
}

// Date filter
interface DateFilterCondition {
  type: 'date';
  operator: DateFilterOperator;
  value?: Date | string;
  valueTo?: Date | string; // For 'between' operator
}
```

## API

### ColumnDefinition

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `filterable` | `boolean` | `true` | Column-level filter control |

### GridCore Methods

```typescript
// Set filter on a column
core.setFilter(
  colId: string,
  filter: ColumnFilterInput | string | null,
);

// Open filter popup
core.openFilterPopup(colIndex: number, anchorRect: DOMRect);

// Close filter popup
core.closeFilterPopup();

// Get distinct values for a column (for checkbox list)
core.getDistinctValuesForColumn(colId: string): CellValue[];

// Check if column is filterable
core.isColumnFilterable(colIndex: number): boolean;

// Check if column has active filter
core.hasActiveFilter(colId: string): boolean;
```

## Keyboard Shortcuts

- **Escape**: Close filter popup without applying

## Localization (labels)

Every user-visible string in the grid is sourced from a shared `GridLabels`
object (English defaults live in `@gp-grid/core`). Override any of them with
the `labels` prop, typed as `GridLabelOverrides`. Top-level labels and nested
`operators` are independently optional, so one operator can be changed
without copying the rest.

```tsx
<Grid
  columns={columns}
  rowData={rows}
  rowHeight={32}
  labels={{
    emptyState: 'No rows to show',
    operators: { greaterThan: 'Superiore a' },
  }}
/>
```

Vue: `:labels="{ emptyState: 'No rows to show' }"`.
Angular: `[labels]="{ emptyState: 'No rows to show' }"`.

`GridLabelOverrides` accepts these `GridLabels` fields:

| Field | Default | Notes |
|-------|---------|-------|
| `filterTitle` | `Filter: {column}` | `{column}` → header name |
| `and` / `or` | `AND` / `OR` | Condition combination toggles |
| `valuePlaceholder` | `Value` | Filter value input placeholder |
| `betweenSeparator` | `to` | Between-operator separator |
| `addCondition` | `+ Add condition` | |
| `removeCondition` | `×` | |
| `addGroup` | `+ Add group` | |
| `removeGroup` | `×` | |
| `clear` / `apply` | `Clear` / `Apply` | |
| `valuesMode` / `conditionMode` | `Values` / `Condition` | Text filter mode toggle |
| `searchPlaceholder` | `Search...` | |
| `selectAll` / `deselectAll` | `Select All` / `Deselect All` | |
| `blanks` | `(Blanks)` | |
| `tooManyValues` | `Too many unique values ({count}). Use conditions to filter.` | `{count}` → entry count |
| `emptyState` | `No data to display` | |
| `errorPrefix` | `Error: {message}` | `{message}` → error text |

`labels.operators` keys: `contains`, `notContains`, `startsWith`, `endsWith`,
`equals`, `notEquals`, `greaterThan`, `lessThan`, `greaterThanOrEqual`,
`lessThanOrEqual`, `between`, `blank`, `notBlank`.
