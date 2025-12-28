// packages/core/src/data-source.test.ts

import { describe, it, expect, vi } from "vitest";
import {
  createClientDataSource,
  createServerDataSource,
  createDataSourceFromArray,
} from "./data-source";
import type { DataSourceRequest } from "./types";

// Sample test data
interface TestRow {
  id: number;
  name: string;
  age: number;
  email: string;
  nested?: {
    city: string;
    country: string;
  };
}

const sampleData: TestRow[] = [
  { id: 1, name: "Alice", age: 30, email: "alice@example.com", nested: { city: "New York", country: "USA" } },
  { id: 2, name: "Bob", age: 25, email: "bob@example.com", nested: { city: "London", country: "UK" } },
  { id: 3, name: "Charlie", age: 35, email: "charlie@example.com", nested: { city: "Paris", country: "France" } },
  { id: 4, name: "Diana", age: 28, email: "diana@example.com", nested: { city: "Berlin", country: "Germany" } },
  { id: 5, name: "Eve", age: 22, email: "eve@example.com", nested: { city: "Tokyo", country: "Japan" } },
];

describe("createClientDataSource", () => {
  describe("pagination", () => {
    it("should return first page of data", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 2 },
      });

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe("Alice");
      expect(result.rows[1].name).toBe("Bob");
      expect(result.totalRows).toBe(5);
    });

    it("should return second page of data", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 1, pageSize: 2 },
      });

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe("Charlie");
      expect(result.rows[1].name).toBe("Diana");
    });

    it("should return partial last page", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 2, pageSize: 2 },
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe("Eve");
    });

    it("should return empty array for out-of-bounds page", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 10, pageSize: 2 },
      });

      expect(result.rows).toHaveLength(0);
      expect(result.totalRows).toBe(5);
    });

    it("should return all data with large page size", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
      });

      expect(result.rows).toHaveLength(5);
    });
  });

  describe("sorting", () => {
    it("should sort ascending by string field", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        sort: [{ colId: "name", direction: "asc" }],
      });

      expect(result.rows.map((r) => r.name)).toEqual([
        "Alice", "Bob", "Charlie", "Diana", "Eve",
      ]);
    });

    it("should sort descending by string field", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        sort: [{ colId: "name", direction: "desc" }],
      });

      expect(result.rows.map((r) => r.name)).toEqual([
        "Eve", "Diana", "Charlie", "Bob", "Alice",
      ]);
    });

    it("should sort ascending by numeric field", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        sort: [{ colId: "age", direction: "asc" }],
      });

      expect(result.rows.map((r) => r.age)).toEqual([22, 25, 28, 30, 35]);
    });

    it("should sort descending by numeric field", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        sort: [{ colId: "age", direction: "desc" }],
      });

      expect(result.rows.map((r) => r.age)).toEqual([35, 30, 28, 25, 22]);
    });

    it("should support multi-column sort", async () => {
      const dataWithDuplicates: TestRow[] = [
        { id: 1, name: "Alice", age: 30, email: "a@example.com" },
        { id: 2, name: "Bob", age: 30, email: "b@example.com" },
        { id: 3, name: "Charlie", age: 25, email: "c@example.com" },
        { id: 4, name: "Diana", age: 25, email: "d@example.com" },
      ];
      
      const dataSource = createClientDataSource(dataWithDuplicates);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        sort: [
          { colId: "age", direction: "asc" },
          { colId: "name", direction: "desc" },
        ],
      });

      expect(result.rows.map((r) => r.name)).toEqual([
        "Diana", "Charlie", "Bob", "Alice",
      ]);
    });

    it("should handle nested field sorting", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        sort: [{ colId: "nested.city", direction: "asc" }],
      });

      expect(result.rows.map((r) => r.nested?.city)).toEqual([
        "Berlin", "London", "New York", "Paris", "Tokyo",
      ]);
    });

    it("should handle null values in sort", async () => {
      const dataWithNulls: TestRow[] = [
        { id: 1, name: "Alice", age: 30, email: "a@example.com" }, // No nested - null city
        { id: 2, name: "Bob", age: 25, email: "b@example.com", nested: { city: "London", country: "UK" } },
        { id: 3, name: "Charlie", age: 35, email: "c@example.com", nested: { city: "Paris", country: "France" } },
      ];
      
      const dataSource = createClientDataSource(dataWithNulls);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        sort: [{ colId: "nested.city", direction: "asc" }],
      });

      // Non-null values sorted first (London, Paris), null last
      expect(result.rows[0].name).toBe("Bob"); // London
      expect(result.rows[1].name).toBe("Charlie"); // Paris
      expect(result.rows[2].name).toBe("Alice"); // null (sorted to end)
    });
  });

  describe("filtering", () => {
    it("should filter by string field (case-insensitive)", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        filter: { name: "ali" },
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe("Alice");
      expect(result.totalRows).toBe(1);
    });

    it("should filter by partial match", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        filter: { email: "example.com" },
      });

      expect(result.rows).toHaveLength(5);
    });

    it("should support multiple filters (AND logic)", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        filter: { name: "a", email: "alice" },
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe("Alice");
    });

    it("should filter by nested field", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        filter: { "nested.country": "usa" },
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe("Alice");
    });

    it("should ignore empty filter values", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        filter: { name: "" },
      });

      expect(result.rows).toHaveLength(5);
    });

    it("should return empty for no matches", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        filter: { name: "xyz" },
      });

      expect(result.rows).toHaveLength(0);
      expect(result.totalRows).toBe(0);
    });

    it("should filter numeric values as strings", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        filter: { age: "30" },
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe("Alice");
    });
  });

  describe("combined sort and filter", () => {
    it("should filter first then sort", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        filter: { email: "example.com" },
        sort: [{ colId: "age", direction: "desc" }],
      });

      expect(result.rows).toHaveLength(5);
      expect(result.rows[0].age).toBe(35);
      expect(result.rows[4].age).toBe(22);
    });

    it("should paginate filtered and sorted results", async () => {
      const dataSource = createClientDataSource(sampleData);
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 2 },
        filter: { email: "example" },
        sort: [{ colId: "name", direction: "asc" }],
      });

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe("Alice");
      expect(result.rows[1].name).toBe("Bob");
      expect(result.totalRows).toBe(5); // Total after filter
    });
  });

  describe("custom getFieldValue", () => {
    it("should use custom field accessor", async () => {
      const dataWithCustomField = [
        { data: { value: "A" } },
        { data: { value: "B" } },
        { data: { value: "C" } },
      ];
      
      const dataSource = createClientDataSource(dataWithCustomField, {
        getFieldValue: (row, field) => {
          if (field === "customField") {
            return (row as { data: { value: string } }).data.value;
          }
          return null;
        },
      });
      
      const result = await dataSource.fetch({
        pagination: { pageIndex: 0, pageSize: 100 },
        sort: [{ colId: "customField", direction: "desc" }],
      });

      expect(result.rows.map((r) => (r as { data: { value: string } }).data.value)).toEqual([
        "C", "B", "A",
      ]);
    });
  });
});

describe("createServerDataSource", () => {
  it("should delegate to fetch function", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      rows: [{ id: 1, name: "Test" }],
      totalRows: 100,
    });
    
    const dataSource = createServerDataSource(mockFetch);
    
    const request: DataSourceRequest = {
      pagination: { pageIndex: 0, pageSize: 10 },
      sort: [{ colId: "name", direction: "asc" }],
      filter: { name: "test" },
    };
    
    const result = await dataSource.fetch(request);

    expect(mockFetch).toHaveBeenCalledWith(request);
    expect(result.rows).toHaveLength(1);
    expect(result.totalRows).toBe(100);
  });

  it("should pass through all request parameters", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ rows: [], totalRows: 0 });
    const dataSource = createServerDataSource(mockFetch);
    
    const request: DataSourceRequest = {
      pagination: { pageIndex: 5, pageSize: 25 },
      sort: [
        { colId: "col1", direction: "asc" },
        { colId: "col2", direction: "desc" },
      ],
      filter: { field1: "value1", field2: "value2" },
    };
    
    await dataSource.fetch(request);

    expect(mockFetch).toHaveBeenCalledWith(request);
    const calledWith = mockFetch.mock.calls[0][0];
    expect(calledWith.pagination).toEqual({ pageIndex: 5, pageSize: 25 });
    expect(calledWith.sort).toHaveLength(2);
    expect(calledWith.filter).toEqual({ field1: "value1", field2: "value2" });
  });

  it("should handle fetch errors", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const dataSource = createServerDataSource(mockFetch);
    
    await expect(
      dataSource.fetch({ pagination: { pageIndex: 0, pageSize: 10 } })
    ).rejects.toThrow("Network error");
  });
});

describe("createDataSourceFromArray", () => {
  it("should create a client data source from array", async () => {
    const dataSource = createDataSourceFromArray(sampleData);
    
    const result = await dataSource.fetch({
      pagination: { pageIndex: 0, pageSize: 100 },
    });

    expect(result.rows).toHaveLength(5);
    expect(result.totalRows).toBe(5);
  });

  it("should support sorting", async () => {
    const dataSource = createDataSourceFromArray(sampleData);
    
    const result = await dataSource.fetch({
      pagination: { pageIndex: 0, pageSize: 100 },
      sort: [{ colId: "name", direction: "asc" }],
    });

    expect(result.rows[0].name).toBe("Alice");
  });

  it("should support filtering", async () => {
    const dataSource = createDataSourceFromArray(sampleData);
    
    const result = await dataSource.fetch({
      pagination: { pageIndex: 0, pageSize: 100 },
      filter: { name: "bob" },
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Bob");
  });

  it("should handle empty array", async () => {
    const dataSource = createDataSourceFromArray([]);
    
    const result = await dataSource.fetch({
      pagination: { pageIndex: 0, pageSize: 10 },
    });

    expect(result.rows).toHaveLength(0);
    expect(result.totalRows).toBe(0);
  });
});

