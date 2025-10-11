import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import { Grid, type ColumnDefinition } from "gp-grid-react";

interface Person {
  id: number;
  name: string;
  age: number;
  email: string;
}

function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const names = ["Giuseppe", "Giovanni", "Mario"];

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80, headerName: "ID" },
  { field: "name", cellDataType: "text", width: 150, headerName: "Name" },
  { field: "age", cellDataType: "number", width: 80, headerName: "Age" },
  {
    field: "email",
    cellDataType: "text",
    width: 250,
    headerName: "Email",
    editable: true,
  },
];

const rowData: Person[] = Array.from({ length: 150000 }, (_, i) => ({
  id: i + 1,
  name: `Person ${names[getRandomInt(0, 2)]}`,
  age: getRandomInt(18, 90),
  email: `person${i + 1}@example.com`,
}));

function App() {
  const [count, setCount] = useState(0);
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
      <div style={{ width: "600px", height: "400px" }}>
        <Grid
          columns={columns}
          rowData={rowData}
          rowHeight={30}
          useWorkers="auto"
          showFilters={true}
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
