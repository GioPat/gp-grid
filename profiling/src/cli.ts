// gp-grid profiling harness entry point.
//
//   pnpm --filter ./profiling profile [--framework react] [--scenario scroll|sort|filter|load|all]
//        [--rows 1000000] [--capture cpuprofile|trace|both] [--iterations 1]
//        [--url http://localhost:5173] [--skip-build] [--headed] [--out <dir>]
//
// Builds and serves the playground's profiling build (unless --url points at
// a running server), runs each scenario under the requested capture mode(s),
// writes the artifacts to profiling/results/<timestamp>/ and generates
// summary.md there. Open a .cpuprofile with `pnpm dlx speedscope <file>` or
// load a .trace.json in the Chrome DevTools Performance panel.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { Browser } from "@playwright/test";
import { captureCpuProfile, captureTrace, launchBrowser, newPage } from "./capture";
import {
  type CaptureMode,
  DEFAULT_ROWS,
  FRAMEWORKS,
  FRAMEWORK_IDS,
  type FrameworkId,
  RESULTS_ROOT,
  SCENARIO_IDS,
  type ScenarioId,
} from "./config";
import { generateReport } from "./report/index";
import { buildRunManifest, type RunManifest } from "./run-manifest";
import { SCENARIOS, type ScenarioContext } from "./scenarios";
import { buildPlayground, servePlayground } from "./servers";

interface CliOptions {
  framework: FrameworkId;
  scenarios: ScenarioId[];
  rows: number;
  captures: CaptureMode[];
  iterations: number;
  url: string | undefined;
  skipBuild: boolean;
  headed: boolean;
  out: string | undefined;
}

const parseList = <T extends string>(raw: string, all: readonly T[], flag: string): T[] => {
  if (raw === "all") return [...all];
  const values = raw.split(",").map((value) => value.trim());
  for (const value of values) {
    if (all.includes(value as T) === false) {
      throw new Error(`--${flag}: unknown value "${value}" (expected ${all.join("|")}|all)`);
    }
  }
  return values as T[];
};

const parseCli = (argv: string[]): CliOptions => {
  const { values } = parseArgs({
    args: argv,
    options: {
      framework: { type: "string", default: "react" },
      scenario: { type: "string", default: "scroll" },
      rows: { type: "string", default: String(DEFAULT_ROWS) },
      capture: { type: "string", default: "cpuprofile" },
      iterations: { type: "string", default: "1" },
      url: { type: "string" },
      "skip-build": { type: "boolean", default: false },
      headed: { type: "boolean", default: false },
      out: { type: "string" },
    },
  });
  const captureRaw = values.capture === "both" ? "cpuprofile,trace" : values.capture;
  return {
    framework: parseList(values.framework, FRAMEWORK_IDS, "framework")[0] ?? "react",
    scenarios: parseList(values.scenario, SCENARIO_IDS, "scenario"),
    rows: Number.parseInt(values.rows, 10),
    captures: parseList(captureRaw, ["cpuprofile", "trace"] as const, "capture"),
    iterations: Math.max(1, Number.parseInt(values.iterations, 10)),
    url: values.url,
    skipBuild: values["skip-build"],
    headed: values.headed,
    out: values.out,
  };
};

const artifactName = (
  framework: string,
  scenario: string,
  iteration: number,
  iterations: number,
): string => (iterations > 1 ? `${framework}-${scenario}-${iteration + 1}` : `${framework}-${scenario}`);

interface RunDeps {
  browser: Browser;
  ctx: ScenarioContext;
  runDir: string;
  options: CliOptions;
}

const runOne = async (
  deps: RunDeps,
  scenarioId: ScenarioId,
  capture: CaptureMode,
  iteration: number,
): Promise<void> => {
  const { browser, ctx, runDir, options } = deps;
  const scenario = SCENARIOS[scenarioId];
  const name = artifactName(ctx.target.id, scenarioId, iteration, options.iterations);
  console.log(`[profiling] ${name} (${capture})`);

  const page = await newPage(browser);
  try {
    await scenario.prepare(page, ctx);
    const run = (): Promise<void> => scenario.run(page, ctx);
    if (capture === "cpuprofile") {
      const result = await captureCpuProfile(page, run);
      writeFileSync(path.join(runDir, `${name}.cpuprofile`), JSON.stringify(result.profile));
      writeFileSync(path.join(runDir, `${name}.measures.json`), JSON.stringify(result.measures));
    } else {
      const result = await captureTrace(browser, page, run);
      writeFileSync(path.join(runDir, `${name}.trace.json`), result.trace);
      writeFileSync(path.join(runDir, `${name}.trace.measures.json`), JSON.stringify(result.measures));
    }
  } finally {
    await page.context().close();
  }
};

const main = async (): Promise<void> => {
  const options = parseCli(process.argv.slice(2));
  const target = FRAMEWORKS[options.framework];
  const runDir = options.out ?? path.join(RESULTS_ROOT, new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(runDir, { recursive: true });

  let baseUrl = options.url;
  let stopServer = (): void => undefined;
  if (baseUrl === undefined) {
    if (options.skipBuild === false) await buildPlayground(target);
    const server = await servePlayground(target);
    baseUrl = server.baseUrl;
    stopServer = server.stop;
  }
  baseUrl = baseUrl.replace(/\/$/, "");

  const browser = await launchBrowser(options.headed);
  const ctx: ScenarioContext = { target, baseUrl, rows: options.rows };
  const manifest: RunManifest = buildRunManifest({
    framework: target.id,
    rows: options.rows,
    scenarios: options.scenarios,
    captures: options.captures,
    iterations: options.iterations,
    baseUrl,
    served: options.url === undefined,
    chromeVersion: browser.version(),
    distDir: target.distDir,
  });
  writeFileSync(path.join(runDir, "run.json"), JSON.stringify(manifest, null, 2));

  try {
    for (const capture of options.captures) {
      for (const scenarioId of options.scenarios) {
        for (let i = 0; i < options.iterations; i++) {
          await runOne({ browser, ctx, runDir, options }, scenarioId, capture, i);
        }
      }
    }
  } finally {
    await browser.close();
    stopServer();
  }

  await generateReport(runDir);
  console.log(`[profiling] done → ${runDir}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
