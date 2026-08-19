# gp-grid profiling harness

Produces flamegraph-ready CPU profiles and DevTools traces of gp-grid running
in a playground, so you can see **where** frame time goes — core
virtualization, the wrapper's instruction apply, or the framework's own render.

Nothing profiling-related ships in `@gp-grid/*`: the harness drives the
playground's production build through Playwright + Chrome DevTools Protocol,
and the semantic `gp-grid:*` spans are installed at runtime by playground code
(`playgrounds/vite-react/src/profiling/`) only when the page is opened with
`?profiling=1`.

## Run

```bash
# from the repo root: builds core+react, builds the playground in profiling
# mode, serves it, profiles a 5 s wheel scroll over 1M rows and writes
# profiling/results/<timestamp>/
pnpm run profile

# with options (from anywhere in the repo):
pnpm --filter ./profiling profile --scenario scroll,sort,filter,load --rows 1000000 --capture both

# against the dev server you already have open (`pnpm dev` — a dev build!)
pnpm --filter ./profiling profile --url http://localhost:5173 --scenario scroll
```

Note: always `pnpm run profile` / `pnpm --filter ./profiling profile` — a bare
`pnpm profile` is forwarded to npm's built-in `profile` command.

| Flag | Values | Default |
|---|---|---|
| `--framework` | `react` (Vue/Angular: see "Adding a framework") | `react` |
| `--scenario` | `scroll`, `sort`, `filter`, `load`, comma list, `all` | `scroll` |
| `--rows` | dataset size passed as `?rows=` | `1000000` |
| `--capture` | `cpuprofile`, `trace`, `both` (two passes) | `cpuprofile` |
| `--iterations` | repeat each scenario N times (`-1`, `-2` … suffixes) | `1` |
| `--url` | profile an already running server instead of building/serving | — |
| `--skip-build` | serve the existing `playgrounds/vite-react/dist` | off |
| `--headed` | show the browser | off |
| `--out` | results directory | `profiling/results/<ISO timestamp>` |

`pnpm --filter ./profiling report [runDir]` regenerates `summary.md` for an
existing run (defaults to the latest).

## Output

```
profiling/results/2026-08-16T15-00-02-254Z/
  run.json                      what/where/when (rows, Chrome, CPU, git sha)
  react-scroll.cpuprofile       V8 sampling profile of the main thread
  react-scroll.measures.json    User Timing measures emitted during the run
  react-scroll.folded.txt       folded stacks (flamegraph.pl / inferno input)
  react-scroll.trace.json       (--capture trace) DevTools Performance trace
  summary.md / summary.json     per-layer self time, hottest functions, spans
```

### Viewing

- **speedscope** — `pnpm dlx speedscope profiling/results/<run>/react-scroll.cpuprofile`.
  *Left Heavy* is the aggregated flamegraph (widest = most self time),
  *Sandwich* shows callers/callees of one function (`syncSlots`,
  `applyInstruction`, `gridReducer`, …). Chunk names tell the layer apart:
  `gp-grid-core.js`, `gp-grid-react.js`, `framework.js`, `index.js` (app).
- **Chrome DevTools** — Performance panel → *Load profile* → pick a
  `.cpuprofile` (flame chart) or a `.trace.json` (full timeline: input →
  script → style/layout → paint, the *Timings* track with the `gp-grid:*` /
  `react:commit` spans, React's "Scheduler ⚛ / Components ⚛" tracks, worker
  threads for the parallel sort).
- **summary.md** — quick text view: self time per layer
  (`@gp-grid/core`, wrapper, framework runtime, playground app, browser
  built-ins, GC, `(program)`), top-25 functions with original `file:line`
  (resolved through source maps), and per-span count / mean / p95.

### `.cpuprofile` vs `.trace.json`

| | `.cpuprofile` | `.trace.json` |
|---|---|---|
| What | V8 sampling profile of one JS thread | Trace events from every process/thread, incl. the same samples |
| Shows | JS functions only; browser work collapses into `(program)`, GC into `(garbage collector)` | Whole frames: input, script, style, layout, paint, composite, frames, User Timing, workers |
| Size | ~100s KB | MBs–10s of MB |
| Use for | "which functions are hot" — aggregated flamegraph, cross-run comparison, `summary.md` | "why is this frame long" — timeline forensics |

`load` under `cpuprofile` works because the profiler is started on a tiny
same-origin page (`?rows=1`) before navigating to `?rows=N`, so the renderer
process is reused; `trace` is browser-level and doesn't need the trick.

## What the spans mean

Installed by `playgrounds/vite-react/src/profiling/span-wrappers.ts` on the
live core (`?profiling=1` only):

| Span | Seam |
|---|---|
| `gp-grid:setViewport` | the hot scroll path: viewport update → visible rows → slots → emit |
| `gp-grid:syncSlots` | virtualization compute inside `setViewport` |
| `gp-grid:dispatch` | `InstructionBatcher.notify/flush` — the core → wrapper hand-off, i.e. the wrapper's synchronous instruction apply |
| `gp-grid:setSort` / `setFilter` | synchronous part of the async sort/filter entry points |
| `react:commit` | React `<Profiler>` commit (React side of the same work) |

The wrappers assert the seams exist and throw if a core refactor renames them.

## Reading the numbers honestly

- The playground is built in production mode but with `react-dom/profiling`
  (for `react:commit` and the React DevTools tracks); that adds a few percent
  of profiler bookkeeping (`now`, `startProfilerTimer`). Core-vs-wrapper ratios
  are what to look at, not absolute React numbers.
- Sampling at 100 µs, User Timing measures and Playwright's wheel pacing all
  perturb timings a little; treat a single run as qualitative and use
  `--iterations` when comparing two changes.
- The playground's own demo code (custom cell renderers, `toLocaleString`
  formatting) lands in the `playground app` bucket — real cost the demo pays,
  not library cost.
- CDP `Profiler` samples the main thread only: the worker-parallel sort shows
  as `(idle)`; use `--capture trace` to see the worker threads.

## Adding a framework

1. Copy `playgrounds/vite-react/src/profiling/{span-wrappers,hooks}.ts` into
   the playground (they are plain TS; only the "get me the core" accessor is
   framework-specific), wire `?rows=`/`?profiling=` and
   `data-testid="grid-container"`, and give the playground a readable
   production build (unminified, sourcemaps, named chunks) — see the React
   playground's `vite.config.ts` `profiling` mode.
2. Register it in `profiling/src/config.ts` (`FRAMEWORKS`: build/serve
   commands, port, dist dir, and the field names the sort/filter scenarios use).
3. Add a `PATH_RULES` entry in `profiling/src/report/buckets.ts` if the
   framework runtime lives under a new `node_modules` name.
