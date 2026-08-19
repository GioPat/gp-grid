// Attribute a frame to a layer. Rules match the *original* source path first
// (from source maps) and fall back to the served chunk name, so the split is
// the same whether or not the build could be symbolicated.

export type Bucket =
  | "core"
  | "wrapper"
  | "framework"
  | "app"
  | "other"
  | "native"
  | "gc"
  | "program"
  | "idle";

export const BUCKET_ORDER: Bucket[] = [
  "core",
  "wrapper",
  "framework",
  "app",
  "other",
  "native",
  "gc",
  "program",
  "idle",
];

export const BUCKET_LABELS: Record<Bucket, string> = {
  core: "@gp-grid/core",
  wrapper: "@gp-grid wrapper",
  framework: "framework runtime",
  app: "playground app",
  other: "other JS",
  native: "browser built-ins called from JS",
  gc: "(garbage collector)",
  program: "(program) — native/browser",
  idle: "(idle)",
};

// Buckets that represent time the page spent (denominator for percentages).
export const ACTIVE_BUCKETS: Bucket[] = [
  "core",
  "wrapper",
  "framework",
  "app",
  "other",
  "native",
  "gc",
  "program",
];

/** Buckets worth listing in the hottest-functions table (real call frames). */
export const FUNCTION_BUCKETS: Bucket[] = ["core", "wrapper", "framework", "app", "other", "native"];

const PSEUDO_FRAMES: Record<string, Bucket> = {
  "(garbage collector)": "gc",
  "(program)": "program",
  "(idle)": "idle",
};

const PATH_RULES: [RegExp, Bucket][] = [
  [/(^|\/)packages\/core\/|\/@gp-grid\/core\/|\/gp-grid-core\.js$/, "core"],
  [/(^|\/)packages\/(react|vue|angular)\/|\/@gp-grid\/(react|vue|angular)\/|\/gp-grid-(react|vue|angular)\.js$/, "wrapper"],
  [/node_modules\/(react|react-dom|scheduler|vue|@vue|@angular|rxjs|zone\.js)\/|\/framework\.js$/, "framework"],
  [/(^|\/)playgrounds\//, "app"],
];

/** Classify by function name (pseudo-frames), then original/served path. */
export const bucketFor = (functionName: string, file: string): Bucket | null => {
  const pseudo = PSEUDO_FRAMES[functionName];
  if (pseudo !== undefined) return pseudo;
  if (functionName === "(root)") return null;
  // Built-ins (performance.now, setAttribute, postMessage…) have no script URL.
  if (file.length === 0) return "native";
  const normalized = file.replaceAll("\\", "/");
  for (const [pattern, bucket] of PATH_RULES) {
    if (pattern.test(normalized)) return bucket;
  }
  return "other";
};
