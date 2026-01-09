// Benchmark data generation with seeded randomness for reproducibility

export interface BenchmarkRow {
  id: number;
  name: string;
  age: number;
  email: string;
  status: "active" | "inactive" | "pending";
  salary: number;
  department: string;
  hireDate: Date;
  isManager: boolean;
  rating: number;
}

const FIRST_NAMES = [
  "Alice",
  "Bob",
  "Charlie",
  "Diana",
  "Eve",
  "Frank",
  "Grace",
  "Henry",
  "Ivy",
  "Jack",
  "Kate",
  "Liam",
  "Mia",
  "Noah",
  "Olivia",
  "Peter",
];

const LAST_NAMES = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Hernandez",
  "Lopez",
  "Gonzalez",
  "Wilson",
  "Anderson",
  "Thomas",
];

const DEPARTMENTS = [
  "Engineering",
  "Sales",
  "Marketing",
  "HR",
  "Finance",
  "Operations",
  "Legal",
  "Support",
];

const STATUSES: BenchmarkRow["status"][] = ["active", "inactive", "pending"];

// Seeded random number generator (LCG) for reproducibility
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  nextFloat(): number {
    this.state = (this.state * 1103515245 + 12345) & 0x7fffffff;
    return this.state / 0x7fffffff;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }

  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }
}

export function generateData(rowCount: number, seed = 42): BenchmarkRow[] {
  const random = new SeededRandom(seed);
  const data: BenchmarkRow[] = [];

  for (let i = 0; i < rowCount; i++) {
    const firstName = random.pick(FIRST_NAMES);
    const lastName = random.pick(LAST_NAMES);

    data.push({
      id: i + 1,
      name: `${firstName} ${lastName}`,
      age: random.nextInt(22, 65),
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i + 1}@example.com`,
      status: random.pick(STATUSES),
      salary: random.nextInt(30000, 200000),
      department: random.pick(DEPARTMENTS),
      hireDate: new Date(
        2015 + random.nextInt(0, 10),
        random.nextInt(0, 11),
        random.nextInt(1, 28)
      ),
      isManager: random.nextFloat() < 0.1,
      rating: Math.round(random.nextFloat() * 5 * 10) / 10,
    });
  }

  return data;
}

// Row counts for benchmarking
export const ROW_COUNTS = [10_000, 100_000, 1_000_000] as const;
export type RowCount = (typeof ROW_COUNTS)[number];
