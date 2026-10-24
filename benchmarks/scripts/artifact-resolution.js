import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const BENCHMARKS_ROOT = path.resolve(scriptDirectory, "..");
export const REPOSITORY_ROOT = path.resolve(BENCHMARKS_ROOT, "..");

export const readBenchmarkSource = () => {
  const source = process.env.BENCH_SOURCE ?? "published";
  if (source === "candidate" || source === "published") {
    return source;
  }

  throw new Error(`BENCH_SOURCE must be "candidate" or "published", received "${source}".`);
};

const packageDefinitions = {
  "@gp-grid/core": {
    candidateEntry: "packages/core/dist/index.js",
    candidateStyle: "packages/core/dist/styles.css",
  },
  "@gp-grid/react": {
    candidateEntry: "packages/react/dist/index.js",
    candidateStyle: "packages/react/dist/styles.css",
  },
};

const sha256 = (filePath) => {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const normalizePath = (filePath) => path.normalize(fs.realpathSync(filePath));

const assertFile = (filePath, label) => {
  if (fs.existsSync(filePath) === false) {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
  return normalizePath(filePath);
};

export const assertCandidateArtifactPath = (filePath, repositoryRoot = REPOSITORY_ROOT) => {
  const artifact = normalizePath(filePath);
  const allowedRoot = `${normalizePath(repositoryRoot)}${path.sep}`;
  if (artifact.startsWith(allowedRoot) === false) {
    throw new Error(`Candidate artifact resolved outside this checkout: ${artifact}`);
  }

  if (artifact.includes(`${path.sep}node_modules${path.sep}`)) {
    throw new Error(`Candidate artifact resolved through node_modules: ${artifact}`);
  }
  return artifact;
};

const candidatePackage = (packageName, definition) => {
  const packageRoot = path.resolve(REPOSITORY_ROOT, path.dirname(definition.candidateEntry), "..");
  const manifest = readJson(path.join(packageRoot, "package.json"));
  const entry = assertCandidateArtifactPath(assertFile(path.resolve(REPOSITORY_ROOT, definition.candidateEntry), `${packageName} entry`));
  const style = assertCandidateArtifactPath(assertFile(path.resolve(REPOSITORY_ROOT, definition.candidateStyle), `${packageName} stylesheet`));
  return {
    name: packageName,
    version: manifest.version,
    entry,
    style,
    entrySha256: sha256(entry),
    styleSha256: sha256(style),
  };
};

const publishedReactManifest = path.join(
  BENCHMARKS_ROOT,
  "node_modules",
  "@gp-grid",
  "react",
  "package.json",
);

const publishedPackage = (packageName) => {
  const reactRoot = path.dirname(normalizePath(publishedReactManifest));
  const packageRoot = packageName === "@gp-grid/react"
    ? reactRoot
    : path.resolve(reactRoot, "..", packageName.split("/").at(-1));
  const manifest = readJson(path.join(packageRoot, "package.json"));
  const rootExport = manifest.exports?.["."];
  const entryExport = typeof rootExport === "string"
    ? rootExport
    : rootExport?.import ?? rootExport?.default ?? manifest.module ?? manifest.main;
  const styleExport = manifest.exports?.["./dist/styles.css"] ?? "./dist/styles.css";
  if (typeof entryExport !== "string" || typeof styleExport !== "string") {
    throw new Error(`${packageName} does not expose a resolvable JavaScript entry and stylesheet.`);
  }
  const entry = assertFile(path.resolve(packageRoot, entryExport), `${packageName} entry`);
  const style = assertFile(path.resolve(packageRoot, styleExport), `${packageName} stylesheet`);
  return {
    name: packageName,
    version: manifest.version,
    entry,
    style,
    entrySha256: sha256(entry),
    styleSha256: sha256(style),
  };
};

const readGit = (args, fallback) => {
  try {
    return execFileSync("git", args, { cwd: REPOSITORY_ROOT, encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
};

export const collectPackageProvenance = (
  packageNames,
  source = readBenchmarkSource(),
) => {
  const packages = packageNames.map((name) => {
    const definition = packageDefinitions[name];
    if (definition === undefined) {
      throw new Error(`Unknown benchmark package "${name}".`);
    }
    return source === "candidate"
      ? candidatePackage(name, definition)
      : publishedPackage(name);
  });

  return {
    source,
    buildProfile: source === "candidate" ? "production" : "published-package",
    commit: readGit(["rev-parse", "HEAD"], "unknown"),
    dirty: readGit(["status", "--porcelain"], "unknown").length > 0,
    repositoryRoot: source === "candidate" ? normalizePath(REPOSITORY_ROOT) : undefined,
    packages,
  };
};

export const collectArtifactProvenance = (source = readBenchmarkSource()) => {
  return collectPackageProvenance(Object.keys(packageDefinitions), source);
};

export const getGpGridAliases = (source = readBenchmarkSource()) => {
  if (source === "published") {
    return [];
  }

  const artifacts = collectArtifactProvenance(source);
  const core = artifacts.packages.find((item) => item.name === "@gp-grid/core");
  const react = artifacts.packages.find((item) => item.name === "@gp-grid/react");
  return [
    { find: "@gp-grid/react/dist/styles.css", replacement: react.style },
    { find: "@gp-grid/core/dist/styles.css", replacement: core.style },
    { find: /^@gp-grid\/react$/, replacement: react.entry },
    { find: /^@gp-grid\/core$/, replacement: core.entry },
  ];
};

export const assertManifestMatchesCurrentArtifacts = (manifest) => {
  const current = collectArtifactProvenance(readBenchmarkSource());
  const saved = manifest.artifacts;
  if (saved === undefined) {
    throw new Error("The active benchmark manifest has no artifact provenance. Start a new run.");
  }
  if (saved.source !== current.source) {
    throw new Error(`Benchmark source mismatch: manifest=${saved.source}, current=${current.source}.`);
  }

  const savedIdentity = JSON.stringify(saved.packages.map(({ name, entry, style, entrySha256, styleSha256 }) => ({ name, entry, style, entrySha256, styleSha256 })));
  const currentIdentity = JSON.stringify(current.packages.map(({ name, entry, style, entrySha256, styleSha256 }) => ({ name, entry, style, entrySha256, styleSha256 })));
  if (savedIdentity !== currentIdentity) {
    throw new Error("The active benchmark manifest describes different gp-grid artifacts. Start a new run.");
  }
  return current;
};
