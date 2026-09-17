// packages/core/src/data-source/columnar-data-source.ts

import type {
  CellValue,
  ColumnarAccess,
  ColumnarDataSource,
  ColumnarDataSourceOptions,
  ColumnarField,
  DataSourceRequest,
  DataSourceResponse,
  RowAccess,
  RowId,
} from "../types";
import { applySort } from "../indexed-data-store/sorting";
import { applyFilters } from "../filtering";

// =============================================================================
// Validation (O(c), no row traversal)
// =============================================================================

const declaredLength = (field: ColumnarField): number | undefined =>
  field.length ?? field.data?.length;

const assertNonNegativeInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `[gp-grid] Columnar ${label} must be a non-negative integer, received ${value}.`,
    );
  }
};

/**
 * Validate the declared schema and lengths in O(c). Never reads a cell value
 * and never enumerates rows.
 */
const resolveRowCount = (
  fields: ColumnarField[],
  explicitRowCount: number | undefined,
): number => {
  if (explicitRowCount !== undefined) {
    assertNonNegativeInteger(explicitRowCount, "rowCount");
    for (const field of fields) {
      // An accessor field's `length` is only a hint used when no rowCount is
      // supplied; an explicit rowCount is authoritative for accessor-only
      // fields, so it can be updated on a revision without touching them.
      if (field.data === undefined) continue;
      const length = declaredLength(field);
      if (length !== explicitRowCount) {
        throw new Error(
          `[gp-grid] Columnar field "${field.field}" declares length ${length} ` +
            `but the source declares rowCount ${explicitRowCount}.`,
        );
      }
    }
    return explicitRowCount;
  }

  const lengths = fields
    .map(declaredLength)
    .filter((length): length is number => length !== undefined);

  if (lengths.length === 0) {
    throw new Error(
      "[gp-grid] Columnar source requires either a rowCount or at least one " +
        "field with a declared length.",
    );
  }

  const rowCount = lengths[0]!;
  assertNonNegativeInteger(rowCount, "rowCount");
  for (const length of lengths) {
    if (length !== rowCount) {
      throw new Error(
        `[gp-grid] Columnar fields declare inconsistent lengths (${length} vs ` +
          `${rowCount}). Every field must expose the same declared row count.`,
      );
    }
  }
  return rowCount;
};

const createFieldIndex = (
  fields: ColumnarField[],
): Map<string, ColumnarField> => {
  const index = new Map<string, ColumnarField>();
  for (const field of fields) {
    if (field.field.length === 0) {
      throw new Error("[gp-grid] Columnar fields require a non-empty field key.");
    }
    if (index.has(field.field)) {
      throw new Error(
        `[gp-grid] Duplicate columnar field "${field.field}". Source-field keys must be unique.`,
      );
    }
    if (field.data === undefined && typeof field.getValue !== "function") {
      throw new Error(
        `[gp-grid] Columnar field "${field.field}" needs a 'data' array or a 'getValue' accessor.`,
      );
    }
    index.set(field.field, field);
  }
  return index;
};

const readField = (
  field: ColumnarField,
  sourceRow: number,
): CellValue => {
  if (field.data !== undefined) {
    const value = field.data[sourceRow];
    return value === undefined ? null : value;
  }
  return field.getValue!(sourceRow) ?? null;
};

// =============================================================================
// Columnar Data Source
// =============================================================================

/**
 * Create a read-only source over already-resident columnar data.
 *
 * Construction validates the declared schema/lengths in O(c) and retains the
 * caller's arrays/views by reference. Normal rendering reads only the cells it
 * needs; no row object, proxy or identity index is allocated.
 */
export function createColumnarDataSource(
  options: ColumnarDataSourceOptions,
): ColumnarDataSource {
  const fieldIndex = createFieldIndex(options.fields);
  // Declared row count is re-derived when a revision is adopted, so appended or
  // removed values are visible after an explicit refresh. Reading it through a
  // getter keeps every access view consistent with the current revision.
  let declaredRowCount = options.rowCount;
  let rowCount = resolveRowCount(options.fields, declaredRowCount);
  const sourceGetRowId = options.getRowId;
  // Identity fallback: the source position itself, stable through sorting and
  // filtering for one revision.
  const identityAt =
    sourceGetRowId ?? ((sourceRow: number): RowId => sourceRow);

  let revision = options.revision ?? 0;

  const access: ColumnarAccess = {
    get rowCount(): number {
      return rowCount;
    },
    get revision(): number {
      return revision;
    },
    fields: options.fields.map((field) => field.field),
    getValue(sourceRow: number, field: string): CellValue {
      if (sourceRow < 0 || sourceRow >= rowCount) return null;
      const column = fieldIndex.get(field);
      return column === undefined ? null : readField(column, sourceRow);
    },
    getRowId: identityAt,
  };

  // Unsorted/unfiltered access resolves a view position arithmetically: no
  // identity index array, ID map, row object or proxy is allocated.
  const identityAccess: RowAccess = {
    get rowCount(): number {
      return rowCount;
    },
    get revision(): number {
      return revision;
    },
    getValue: (viewRow, field) => access.getValue(viewRow, field),
    getRowId: identityAt,
  };

  const buildViewAccess = (indices: number[]): RowAccess => {
    let released = false;
    return {
      rowCount: indices.length,
      revision,
      getValue(viewRow: number, field: string): CellValue {
        if (released || viewRow < 0 || viewRow >= indices.length) return null;
        return access.getValue(indices[viewRow]!, field);
      },
      getRowId: (viewRow: number): RowId => identityAt(indices[viewRow]!),
      release(): void {
        released = true;
        indices.length = 0;
      },
    };
  };

  const resolveField = (
    request: DataSourceRequest,
  ): ((columnId: string) => string) =>
    (columnId) => request.fieldMap?.[columnId] ?? columnId;

  return {
    kind: "columnar",
    writable: false,
    loadMode: "all",

    get revision(): number {
      return revision;
    },

    access,

    async query(request: DataSourceRequest): Promise<DataSourceResponse<never>> {
      const hasFilter =
        request.filter !== undefined &&
        Object.keys(request.filter).length > 0;
      const hasSort = request.sort !== undefined && request.sort.length > 0;

      if (hasFilter === false && hasSort === false) {
        return { rows: [], totalRows: rowCount, access: identityAccess };
      }

      const fieldOf = resolveField(request);
      const getFieldValue = (sourceRow: number, field: string): CellValue =>
        access.getValue(sourceRow, fieldOf(field));

      // Sorting/filtering may allocate O(n) projection indices; source
      // columns are never mutated or copied wholesale into row objects.
      let indices: number[] = new Array(rowCount);
      for (let row = 0; row < rowCount; row += 1) indices[row] = row;

      if (hasFilter) {
        indices = applyFilters(
          indices,
          request.filter!,
          getFieldValue,
          (field) => request.valueFormatters?.[field],
        );
      }
      if (hasSort) {
        indices = applySort(indices, request.sort!, getFieldValue);
      }

      return {
        rows: [],
        totalRows: indices.length,
        access: buildViewAccess(indices),
      };
    },

    getRecord(sourceRow: number): Record<string, CellValue> {
      const record: Record<string, CellValue> = {};
      if (sourceRow < 0 || sourceRow >= rowCount) return record;
      for (const field of options.fields) {
        record[field.field] = readField(field, sourceRow);
      }
      return record;
    },

    setRevision(nextRevision: number, nextRowCount?: number): void {
      // Adopting a revision revalidates declared lengths so appended or removed
      // values change the row count. A source created with an explicit
      // rowCount passes the updated count here; accessor-only sources need no
      // field change. Throws on an inconsistent schema.
      const candidateRowCount = nextRowCount ?? declaredRowCount;
      // Validate before committing so a rejected revision leaves state intact.
      const resolvedRowCount = resolveRowCount(
        options.fields,
        candidateRowCount,
      );
      declaredRowCount = candidateRowCount;
      rowCount = resolvedRowCount;
      revision = nextRevision;
    },
  };
}
