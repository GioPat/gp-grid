// playgrounds/angular/src/app/demo-columnar.ts
// The main page's people as a columnar source: one typed array per field,
// strings and dates through small code tables, plus accessor-only metric
// columns for the wide grid that shows the column window.

import { createColumnarDataSource } from '@gp-grid/angular';
import type { AngularColumnDefinition, ColumnarDataSource } from '@gp-grid/angular';

export interface ColumnarPerson {
  id: number;
  name: string;
  age: number;
  city: string;
  bio: string;
  createdAt: Date;
  status: string;
  salary: number;
}

export const WIDE_COLUMN_COUNT = 200;

const codeTable = <T>(keyOf: (value: T) => string) => {
  const codes = new Map<string, number>();
  const table: T[] = [];
  const codeOf = (value: T): number => {
    const key = keyOf(value);
    const known = codes.get(key);
    if (known !== undefined) return known;
    codes.set(key, table.length);
    table.push(value);
    return table.length - 1;
  };
  return { table, codeOf };
};

export const createDemoColumnarSource = (people: readonly ColumnarPerson[], metricColumns: number): ColumnarDataSource => {
  const count = people.length;
  const id = new Int32Array(count);
  const age = new Uint8Array(count);
  const salary = new Float64Array(count);
  const name = new Uint8Array(count);
  const city = new Uint8Array(count);
  const bio = new Uint8Array(count);
  const createdAt = new Uint8Array(count);
  const status = new Uint8Array(count);
  const names = codeTable<string>((value) => value);
  const cities = codeTable<string>((value) => value);
  const bios = codeTable<string>((value) => value);
  const dates = codeTable<Date>((value) => String(value.getTime()));
  const statuses = codeTable<string>((value) => value);
  people.forEach((person, row) => {
    id[row] = person.id;
    age[row] = person.age;
    salary[row] = person.salary;
    name[row] = names.codeOf(person.name);
    city[row] = cities.codeOf(person.city);
    bio[row] = bios.codeOf(person.bio);
    createdAt[row] = dates.codeOf(person.createdAt);
    status[row] = statuses.codeOf(person.status);
  });
  const metrics = Array.from({ length: metricColumns }, (_, index) => ({
    field: `m${index}`,
    getValue: (row: number) => ((row * 7919 + index * 104729) % 100000) / 100,
  }));
  return createColumnarDataSource({
    rowCount: count,
    getRowId: (row) => id[row],
    fields: [
      { field: 'id', data: id },
      { field: 'name', getValue: (row) => names.table[name[row]] },
      { field: 'age', data: age },
      { field: 'city', getValue: (row) => cities.table[city[row]] },
      { field: 'bio', getValue: (row) => bios.table[bio[row]] },
      { field: 'createdAt', getValue: (row) => dates.table[createdAt[row]] },
      { field: 'status', getValue: (row) => statuses.table[status[row]] },
      { field: 'salary', data: salary },
      ...metrics,
    ],
  });
};

export const createWideColumns = (count: number): AngularColumnDefinition[] =>
  Array.from({ length: count }, (_, index) => ({
    field: `m${index}`,
    cellDataType: 'number',
    width: 150,
    headerName: `Metric ${index + 1}`,
  }));
