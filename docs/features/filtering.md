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
| `=` | = | Equal to |
| `!=` | ≠ | Not equal to |
| `>` | > | Greater than |
| `<` | < | Less than |
| `>=` | ≥ | Greater or equal |
| `<=` | ≤ | Less or equal |
| `between` | ↔ | Between two values |
| `blank` | Is blank | Null/undefined values |
| `notBlank` | Not blank | Non-null values |

### Date Filter

For `date`, `dateString`, `dateTime`, `dateTimeString` column types. Same operators as number (except >= and <=).

## Multiple Conditions

Add multiple conditions and combine with AND/OR:

```
Condition 1: > 100
AND
Condition 2: < 500
```

## Filter Model

The filter model structure:

```typescript
interface ColumnFilterModel {
  conditions: FilterCondition[];
  combination: 'and' | 'or';
}

type FilterCondition =
  | TextFilterCondition
  | NumberFilterCondition
  | DateFilterCondition;

// Text filter
interface TextFilterCondition {
  type: 'text';
  operator: TextFilterOperator;
  selectedValues?: Set<CellValue>;
  includeBlank?: boolean;
}
```

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
core.setFilter(colId: string, filter: ColumnFilterModel | null);

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
