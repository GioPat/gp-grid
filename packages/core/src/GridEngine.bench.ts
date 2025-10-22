import { bench, describe } from "vitest";
import { GridEngine, type ColumnDefinition } from "./GridEngine";

// Helper to generate test data
function generateData(rowCount: number) {
  const firstNames = [
    "Alice",
    "Bob",
    "Charlie",
    "Diana",
    "Eve",
    "Frank",
    "Grace",
    "Henry",
  ];
  const lastNames = [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
  ];
  const departments = ["Engineering", "Marketing", "Sales", "HR", "Finance"];

  return Array.from({ length: rowCount }, (_, i) => ({
    id: i + 1,
    firstName: firstNames[i % firstNames.length]!,
    lastName: lastNames[i % lastNames.length]!,
    age: 20 + (i % 45),
    salary: 40000 + (i % 100000),
    department: {
      name: departments[i % departments.length]!,
      code: `D${(i % departments.length) + 1}`,
    },
    email: `user${i}@example.com`,
    active: i % 2 === 0,
  }));
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80 },
  { field: "firstName", cellDataType: "text", width: 150 },
  { field: "lastName", cellDataType: "text", width: 150 },
  { field: "age", cellDataType: "number", width: 100 },
  { field: "salary", cellDataType: "number", width: 120 },
  {
    field: "department.name",
    cellDataType: "text",
    width: 150,
    colId: "departmentName",
  },
  { field: "email", cellDataType: "text", width: 200 },
  { field: "active", cellDataType: "boolean", width: 100 },
];

describe("GridEngine Performance", () => {
  describe("Initialization", () => {
    bench("Initialize with 1,000 rows", () => {
      const data = generateData(1000);
      new GridEngine({ columns, rowData: data, rowHeight: 40 });
    });

    bench("Initialize with 10,000 rows", () => {
      const data = generateData(10000);
      new GridEngine({ columns, rowData: data, rowHeight: 40 });
    });

    bench("Initialize with 100,000 rows", () => {
      const data = generateData(100000);
      new GridEngine({ columns, rowData: data, rowHeight: 40 });
    });
  });

  describe("Sorting", () => {
    bench("Sort 1,000 rows (single column)", async () => {
      const data = generateData(1000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      await engine.setSort("age", "asc");
    });

    bench("Sort 10,000 rows (single column)", async () => {
      const data = generateData(10000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      await engine.setSort("age", "asc");
    });

    bench("Sort 100,000 rows (single column)", async () => {
      const data = generateData(100000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      await engine.setSort("age", "asc");
    });

    bench("Multi-column sort 10,000 rows", async () => {
      const data = generateData(10000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      await engine.setSort("departmentName", "asc");
      await engine.setSort("age", "desc", true);
    });
  });

  describe("Filtering", () => {
    bench("Filter 1,000 rows", async () => {
      const data = generateData(1000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      await engine.setFilter("firstName", "Alice");
    });

    bench("Filter 10,000 rows", async () => {
      const data = generateData(10000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      await engine.setFilter("firstName", "Alice");
    });

    bench("Filter 100,000 rows", async () => {
      const data = generateData(100000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      await engine.setFilter("firstName", "Alice");
    });

    bench("Multi-column filter 10,000 rows", async () => {
      const data = generateData(10000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      await engine.setFilter("firstName", "Alice");
      await engine.setFilter("departmentName", "Engineering");
    });
  });

  describe("Combined Operations", () => {
    bench("Filter + Sort 10,000 rows", async () => {
      const data = generateData(10000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      await engine.setFilter("departmentName", "Engineering");
      await engine.setSort("age", "asc");
    });

    bench("Filter + Sort + computeVisible 10,000 rows", async () => {
      const data = generateData(10000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      engine.onRender(() => {
        // No-op renderer
      });
      await engine.setFilter("departmentName", "Engineering");
      await engine.setSort("age", "asc");
      engine.computeVisible(0, 0, 1920, 1080); // Full HD viewport
    });
  });

  describe("Rendering", () => {
    bench("computeVisible on 1,000 rows", () => {
      const data = generateData(1000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      engine.onRender(() => {
        // No-op renderer
      });
      engine.computeVisible(0, 0, 1920, 1080);
    });

    bench("computeVisible on 10,000 rows", () => {
      const data = generateData(10000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      engine.onRender(() => {
        // No-op renderer
      });
      engine.computeVisible(0, 0, 1920, 1080);
    });

    bench("computeVisible on 100,000 rows", () => {
      const data = generateData(100000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      engine.onRender(() => {
        // No-op renderer
      });
      engine.computeVisible(0, 0, 1920, 1080);
    });

    bench("computeVisible with scrolling (simulated)", () => {
      const data = generateData(10000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      engine.onRender(() => {
        // No-op renderer
      });
      // Simulate scrolling through the data
      for (let i = 0; i < 100; i++) {
        engine.computeVisible(0, i * 400, 1920, 1080);
      }
    });
  });

  describe("Data Updates", () => {
    bench("Update row data (1,000 rows)", async () => {
      const data = generateData(1000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      const newData = generateData(1000);
      await engine.updateRowData(newData);
    });

    bench("Update row data (10,000 rows)", async () => {
      const data = generateData(10000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      const newData = generateData(10000);
      await engine.updateRowData(newData);
    });

    bench("setCellValue single cell", () => {
      const data = generateData(1000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      engine.setCellValue(100, 2, "NewValue");
    });

    bench("setCellValue 100 cells", () => {
      const data = generateData(1000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });
      for (let i = 0; i < 100; i++) {
        engine.setCellValue(i, 2, `NewValue${i}`);
      }
    });
  });

  describe("Memory/GC Pressure", () => {
    bench("Repeated filter changes (GC pressure test)", async () => {
      const data = generateData(10000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });

      // Simulate rapid filter changes
      for (let i = 0; i < 10; i++) {
        await engine.setFilter("firstName", i % 2 === 0 ? "Alice" : "Bob");
      }
    });

    bench("Repeated sort changes (GC pressure test)", async () => {
      const data = generateData(10000);
      const engine = new GridEngine({ columns, rowData: data, rowHeight: 40 });

      // Simulate rapid sort changes
      for (let i = 0; i < 10; i++) {
        await engine.setSort("age", i % 2 === 0 ? "asc" : "desc");
      }
    });
  });
});
