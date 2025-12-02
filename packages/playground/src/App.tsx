import { useState, useMemo } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import {
  Grid,
  createClientDataSource,
  type ColumnDefinition,
  type CellRendererParams,
} from "gp-grid-react";

interface Person {
  id: number;
  name: string;
  age: number;
  email: string;
  status: "active" | "inactive" | "pending";
  salary: number;
}

function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const names = ["Giuseppe", "Giovanni", "Mario"];
const statuses: Person["status"][] = ["active", "inactive", "pending"];

// Define reusable React renderers (AG-Grid style registry pattern)
const cellRenderers = {
  // Currency formatter - reusable for multiple columns
  currency: (params: CellRendererParams) => {
    const value = params.value as number;
    return (
      <span style={{ color: "#047857", fontWeight: "600" }}>
        ${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </span>
    );
  },

  // Status badge - styled pill
  statusBadge: (params: CellRendererParams) => {
    const status = params.value as Person["status"];
    const colors = {
      active: { bg: "#dcfce7", text: "#166534" },
      inactive: { bg: "#fee2e2", text: "#991b1b" },
      pending: { bg: "#fef3c7", text: "#92400e" },
    };
    const color = colors[status];

    return (
      <span
        style={{
          backgroundColor: color.bg,
          color: color.text,
          padding: "2px 8px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: "600",
        }}
      >
        {status.toUpperCase()}
      </span>
    );
  },

  // Bold text renderer
  bold: (params: CellRendererParams) => {
    return <strong>{String(params.value ?? "")}</strong>;
  },
};

const columns: ColumnDefinition[] = [
  {
    field: "id",
    cellDataType: "number",
    width: 80,
    headerName: "ID",
    cellRenderer: "bold", // Reference renderer by key
  },
  { field: "name", cellDataType: "text", width: 150, headerName: "Name" },
  { field: "age", cellDataType: "number", width: 80, headerName: "Age" },
  {
    field: "email",
    cellDataType: "text",
    width: 250,
    headerName: "Email",
    editable: true,
  },
  {
    field: "status",
    cellDataType: "text",
    width: 120,
    headerName: "Status",
    cellRenderer: "statusBadge", // Reference renderer by key
  },
  {
    field: "salary",
    cellDataType: "number",
    width: 150,
    headerName: "Salary",
    cellRenderer: "currency", // Reference renderer by key
  },
];

// Generate sample data
const generateRowData = (): Person[] =>
  Array.from({ length: 150000 }, (_, i) => ({
    id: i + 1,
    name: `Person ${names[getRandomInt(0, 2)]}`,
    age: getRandomInt(18, 90),
    email: `person${i + 1}@example.com`,
    status: statuses[getRandomInt(0, 2)],
    salary: getRandomInt(30000, 150000),
  }));

function App() {
  const [count, setCount] = useState(0);

  // Create data source (memoized to prevent recreating on every render)
  const dataSource = useMemo(() => {
    const rowData = generateRowData();
    return createClientDataSource(rowData);
  }, []);

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>GP Grid Demo</h1>
      <div style={{ width: "800px", height: "400px" }}>
        <Grid
          columns={columns}
          dataSource={dataSource}
          rowHeight={36}
          headerHeight={40}
          showFilters={true}
          cellRenderers={cellRenderers}
        />
      </div>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
