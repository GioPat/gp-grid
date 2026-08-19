// Generate summary.md / summary.json (+ folded stacks per profile) for a run
// directory produced by the CLI. Re-runnable on existing artifacts.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CpuProfile, UserTimingMeasure } from "../capture";
import type { RunManifest } from "../run-manifest";
import { analyzeProfile } from "./cpuprofile";
import { renderSummaryMarkdown } from "./markdown";
import { summarizeMeasures } from "./measures";
import { createFrameResolver } from "./sourcemaps";
import { type ArtifactSummary, summarizeMeasuresOnly, summarizeProfile } from "./summary";

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

const readMeasures = (file: string): UserTimingMeasure[] =>
  existsSync(file) ? readJson<UserTimingMeasure[]>(file) : [];

const summarizeCpuProfiles = (runDir: string, manifest: RunManifest): ArtifactSummary[] => {
  const resolver = createFrameResolver(manifest.distDir, manifest.baseUrl);
  return readdirSync(runDir)
    .filter((file) => file.endsWith(".cpuprofile"))
    .sort()
    .map((file) => {
      const name = file.slice(0, -".cpuprofile".length);
      const analysis = analyzeProfile(readJson<CpuProfile>(path.join(runDir, file)));
      writeFileSync(path.join(runDir, `${name}.folded.txt`), analysis.folded.join("\n"));
      const measures = summarizeMeasures(readMeasures(path.join(runDir, `${name}.measures.json`)));
      return summarizeProfile(name, analysis, resolver, measures);
    });
};

const summarizeTraces = (runDir: string): ArtifactSummary[] =>
  readdirSync(runDir)
    .filter((file) => file.endsWith(".trace.measures.json"))
    .sort()
    .map((file) => {
      const name = file.slice(0, -".trace.measures.json".length);
      return summarizeMeasuresOnly(name, summarizeMeasures(readMeasures(path.join(runDir, file))));
    });

export const generateReport = async (runDir: string): Promise<void> => {
  const manifestFile = path.join(runDir, "run.json");
  if (existsSync(manifestFile) === false) {
    throw new Error(`no run.json in ${runDir}`);
  }
  const manifest = readJson<RunManifest>(manifestFile);
  const summaries = [...summarizeCpuProfiles(runDir, manifest), ...summarizeTraces(runDir)];
  writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(summaries, null, 2));
  writeFileSync(path.join(runDir, "summary.md"), renderSummaryMarkdown(runDir, manifest, summaries));
  console.log(`[profiling] report → ${path.join(runDir, "summary.md")}`);
};
