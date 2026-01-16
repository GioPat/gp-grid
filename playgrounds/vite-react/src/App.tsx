import { useState, useMemo } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import {
  Grid,
  createClientDataSource,
  type ColumnDefinition,
  type CellRendererParams,
  type EditRendererParams,
} from "gp-grid-react";
import Select from "react-select";
import { LiveInsertDemo } from "./LiveInsertDemo";

type DemoPage = "main" | "live-insert";

interface Person {
  id: number;
  name: string;
  age: number;
  email: string;
  status: "active" | "inactive" | "pending";
  salary: number;
  tags: string[];
}

// Available tag options for the multi-select
const tagOptions = [
  { value: "vip", label: "VIP" },
  { value: "new", label: "New" },
  { value: "priority", label: "Priority" },
  { value: "archived", label: "Archived" },
  { value: "verified", label: "Verified" },
];

function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const names = ["Ennio", "Giovanni", "Mario", "Giuseppe"];
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

  // Tags renderer - displays tags as badges with vertical scroll
  tags: (params: CellRendererParams) => {
    const tags = (params.value as string[]) || [];
    if (tags.length === 0) {
      return (
        <span style={{ color: "#6b7280", fontStyle: "italic" }}>No tags</span>
      );
    }
    return (
      <div
        style={{
          display: "flex",
          gap: "4px",
          flexWrap: "wrap",
          maxHeight: "100%",
          overflowY: "auto",
          alignContent: "flex-start",
          padding: "2px 0",
        }}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              backgroundColor: "#3b82f6",
              color: "#ffffff",
              padding: "2px 6px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: "500",
              flexShrink: 0,
            }}
          >
            {tag.toUpperCase()}
          </span>
        ))}
      </div>
    );
  },
};

// Multi-select editor component with local state for live updates
function MultiSelectEditor({ params }: { params: EditRendererParams }) {
  const initialTags = (params.initialValue as string[]) || [];
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags);

  const selectedOptions = tagOptions.filter((opt) =>
    selectedTags.includes(opt.value),
  );

  const handleChange = (
    newValue: readonly { value: string; label: string }[],
  ) => {
    const newTags = newValue.map((opt) => opt.value);
    setSelectedTags(newTags);
    params.onValueChange(newTags);
  };

  return (
    <Select
      isMulti
      autoFocus
      menuIsOpen
      options={tagOptions}
      value={selectedOptions}
      onChange={handleChange}
      onBlur={() => params.onCommit()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          params.onCancel();
        }
      }}
      // Use portal to render dropdown outside the cell's overflow:hidden
      menuPortalTarget={document.body}
      menuPosition="fixed"
      styles={{
        container: (base) => ({
          ...base,
          width: "100%",
          height: "32px", // Match row height minus border
        }),
        control: (base) => ({
          ...base,
          minHeight: "32px",
          height: "32px",
          backgroundColor: "#1f2937",
          borderColor: "#3b82f6",
          boxShadow: "0 0 0 1px #3b82f6",
          alignItems: "flex-start",
          border: "none",
        }),
        valueContainer: (base) => ({
          ...base,
          height: "30px",
          maxHeight: "30px",
          overflowY: "auto",
          overflowX: "hidden",
          flexWrap: "wrap",
          alignContent: "flex-start",
          padding: "2px 8px",
        }),
        indicatorsContainer: (base) => ({
          ...base,
          height: "32px",
        }),
        menu: (base) => ({
          ...base,
          backgroundColor: "#1f2937",
          zIndex: 9999,
        }),
        menuPortal: (base) => ({
          ...base,
          zIndex: 9999,
        }),
        option: (base, state) => ({
          ...base,
          backgroundColor: state.isFocused ? "#374151" : "#1f2937",
          color: "#f3f4f6",
          cursor: "pointer",
        }),
        multiValue: (base) => ({
          ...base,
          backgroundColor: "#3b82f6",
          margin: "1px 2px",
        }),
        multiValueLabel: (base) => ({
          ...base,
          color: "#ffffff",
          padding: "1px 4px",
          fontSize: "11px",
        }),
        multiValueRemove: (base) => ({
          ...base,
          color: "#ffffff",
          padding: "0 2px",
          ":hover": {
            backgroundColor: "#2563eb",
            color: "#ffffff",
          },
        }),
        input: (base) => ({
          ...base,
          color: "#f3f4f6",
          margin: "0",
          padding: "0",
        }),
      }}
    />
  );
}

// Define edit renderers
const editRenderers = {
  multiSelect: (params: EditRendererParams) => (
    <MultiSelectEditor params={params} />
  ),
};

const columns: ColumnDefinition[] = [
  {
    field: "id",
    cellDataType: "number",
    width: 80,
    hidden: true,
    headerName: "ID",
    cellRenderer: "bold", // Reference renderer by key
  },
  {
    field: "name",
    editable: true,
    cellDataType: "text",
    width: 150,
    headerName: "Name",
  },
  { field: "age", cellDataType: "number", width: 110, headerName: "Age" },
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
  {
    field: "tags",
    cellDataType: "object",
    width: 200,
    headerName: "Tags",
    cellRenderer: "tags",
    editRenderer: "multiSelect",
    editable: true,
    sortable: true,
  },
];

// Helper to get random tags
const getRandomTags = (): string[] => {
  const numTags = getRandomInt(0, 3);
  const shuffled = [...tagOptions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, numTags).map((opt) => opt.value);
};

// Generate sample data
const generateRowData = (): Person[] =>
  Array.from({ length: 1500000 }, (_, i) => ({
    id: i + 1,
    name: `Person ${names[getRandomInt(0, 2)]}`,
    age: getRandomInt(18, 90),
    email: `person${i + 1}@example.com`,
    status: statuses[getRandomInt(0, 2)],
    salary: getRandomInt(30000, 150000),
    tags: getRandomTags(),
  }));

function MainDemo() {
  const [count, setCount] = useState(0);

  // Keep reference to raw data so we can access it later
  const rowData = useMemo(() => generateRowData(), []);

  // Create data source from the row data
  const dataSource = useMemo(() => createClientDataSource(rowData), [rowData]);

  // Handler to demonstrate reading all grid data
  const handleGetAllData = () => {
    console.log("=== All Grid Data ===");
    console.log(`Total rows: ${rowData.length}`);

    // Show first 10 rows with their tags
    console.log("First 10 rows with tags:");
    rowData.slice(0, 10).forEach((row) => {
      console.log(
        `  ID ${row.id}: ${row.name} - Tags: [${row.tags.join(", ")}]`,
      );
    });

    // Count rows by tag
    const tagCounts: Record<string, number> = {};
    rowData.forEach((row) => {
      row.tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    console.log("Tag distribution:", tagCounts);

    alert("Data logged to console. Open DevTools to see the output.");
  };

  return (
    <>
      <h2 style={{ marginBottom: "16px", color: "#f3f4f6" }}>
        Large Dataset Demo (1.5M rows)
      </h2>
      <div style={{ width: "1000px", height: "400px" }}>
        <Grid
          highlighting={{
            hoverScope: "cell",
            computeRowClasses: (context) => {
              if (context.rowData?.name === "Person Ennio")
                return ["background-row"];
              else return [];
            },
            computeColumnClasses: (context) => {
              if (context.column?.field === "salary") return ["column-styling"];
              else return [];
            },
            computeCellClasses: (context) => {
              if (context.isHovered) return ["column-styling"];
              else return [];
            },
          }}
          columns={columns}
          dataSource={dataSource}
          rowHeight={36}
          darkMode={true}
          headerHeight={40}
          cellRenderers={cellRenderers}
          editRenderers={editRenderers}
        />
      </div>
      <div
        className="card"
        style={{ display: "flex", gap: "12px", alignItems: "center" }}
      >
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <button
          onClick={handleGetAllData}
          style={{
            backgroundColor: "#3b82f6",
            color: "white",
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            fontWeight: "500",
          }}
        >
          Get All Data
        </button>
        <p style={{ margin: 0 }}>
          Double-click on Tags column to edit with multi-select
        </p>
      </div>
    </>
  );
}

function App() {
  const [currentPage, setCurrentPage] = useState<DemoPage>("main");

  const tabStyle = (isActive: boolean) => ({
    padding: "10px 20px",
    border: "none",
    borderBottom: isActive ? "3px solid #3b82f6" : "3px solid transparent",
    backgroundColor: "transparent",
    color: isActive ? "#3b82f6" : "#9ca3af",
    cursor: "pointer",
    fontWeight: isActive ? "600" : "400",
    fontSize: "14px",
    transition: "all 0.2s",
  });

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

      <div
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "24px",
          borderBottom: "1px solid #374151",
        }}
      >
        <button
          onClick={() => setCurrentPage("main")}
          style={tabStyle(currentPage === "main")}
        >
          Large Dataset
        </button>
        <button
          onClick={() => setCurrentPage("live-insert")}
          style={tabStyle(currentPage === "live-insert")}
        >
          Live Insert
        </button>
      </div>

      {currentPage === "main" && <MainDemo />}
      {currentPage === "live-insert" && <LiveInsertDemo />}

      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
