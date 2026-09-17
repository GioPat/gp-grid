import { useCallback, useMemo, useRef, useState } from "react";
import { Grid } from "@gp-grid/react";
import type { CellValueChangedEvent, ColumnDefinition, GridRef } from "@gp-grid/react";

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
  name: `Row ${index.toString().padStart(3, "0")}`,
  city: `City ${index % 11}`,
  score: index * 3,
  team: `Team ${index % 7}`,
  status: index % 2 === 0 ? "active" : "inactive",
  note: `Note ${index}`,
  code: `C-${index.toString().padStart(4, "0")}`,
}));

const createColumns = (): ColumnDefinition[] => [
  { colId: "id", field: "id", headerName: "ID", width: 90, cellDataType: "number", sortable: true },
  { colId: "name", field: "name", headerName: "Name", width: 180, cellDataType: "text", sortable: true, filterable: true, editable: true },
  { colId: "city", field: "city", headerName: "City", width: 140, cellDataType: "text" },
  { colId: "score", field: "score", headerName: "Score", width: 120, cellDataType: "number" },
  { colId: "team", field: "team", headerName: "Team", width: 150, cellDataType: "text" },
  { colId: "status", field: "status", headerName: "Status", width: 130, cellDataType: "text" },
  { colId: "note", field: "note", headerName: "Note", width: 210, cellDataType: "text" },
  { colId: "code", field: "code", headerName: "Code", width: 160, cellDataType: "text" },
];

export const ConformanceApp = (): React.ReactNode => {
  const [rows, setRows] = useState(createRows);
  const [columns, setColumns] = useState(createColumns);
  const [mounted, setMounted] = useState(true);
  const [generation, setGeneration] = useState(0);
  const [editEvents, setEditEvents] = useState(0);
  const gridRef = useRef<GridRef<ConformanceRow> | null>(null);

  const replaceColumns = useCallback(() => {
    setColumns([
      { colId: "score", field: "score", headerName: "Score", width: 120, cellDataType: "number" },
      { colId: "city", field: "city", headerName: "City", width: 140, cellDataType: "text" },
      { colId: "replacement", field: "code", headerName: "Replacement", width: 190, cellDataType: "text" },
    ]);
  }, []);

  const reset = useCallback(() => {
    setRows(createRows());
    setColumns(createColumns());
    setMounted(true);
    setGeneration((value) => value + 1);
    setEditEvents(0);
  }, []);

  const remount = useCallback(() => {
    setMounted(false);
    window.setTimeout(() => {
      setGeneration((value) => value + 1);
      setMounted(true);
    }, 0);
  }, []);

  const onCellValueChanged = useCallback((event: CellValueChangedEvent<ConformanceRow>) => {
    setRows((current) => current.map((row) => row.id === event.rowId ? { ...row, [event.field]: event.newValue } : row));
    setEditEvents((value) => value + 1);
  }, []);

  const metrics = useMemo(() => ({ generation, editEvents }), [generation, editEvents]);

  return (
    <main data-conformance-framework="react" style={{ width: 620, margin: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button data-testid="reset" onClick={reset}>Reset</button>
        <button data-testid="remount" onClick={remount}>Remount</button>
        <button data-testid="replace-columns" onClick={replaceColumns}>Replace columns</button>
        <output data-testid="metrics">{JSON.stringify(metrics)}</output>
      </div>
      <div data-testid="grid-host" style={{ width: 600, height: 360 }}>
        {mounted && (
          <Grid
            key={generation}
            gridRef={gridRef}
            columns={columns}
            rowData={rows}
            rowHeight={32}
            headerHeight={36}
            getRowId={(row) => row.id}
            onCellValueChanged={onCellValueChanged}
          />
        )}
      </div>
    </main>
  );
};
