# AGENTS.md

gp-grid is a typescript library with dedicated framework/library wrappers that allows user to manage tables and grids. The core idea of gp-grid is to give users a tool with "batteries included" but give room for full customizability. One of the core principle is the bundle size, allowing users to manage gp-grid in resource constrained (memory, bundle) environments so it cannot include external dependencies. Another core principle is the DX (Developer Experience)

## Structure

The packages are available under the `packages` folder, in particular:

- `packages/core`: library/framework typescript agnostic core providing common logic.
- `packages/react`: react wrapper
- `packages/vue`: VueJS wrapper
- `packages/angular`: AngularJS wrapper

gp-grid comes with a skill available under the `.claude` subfolder.

The repo contains also playgrounds that are used to smoke and quick test features and are available under `playgrounds`.

## Commands

See `package.json`

## Build

Bundlers: `tsdown` (rolldown) for `core`, `react` and `vue`, configured in each package's `tsdown.config.ts`; `ng-packagr` for `angular`, followed by `scripts/postbuild.mjs`. Build `core` first: the wrappers copy `../core/dist/styles.css` at build time.

- **Two profiles.** `build` is the dev profile (readable output, sourcemaps) used by `pnpm dev*`, `build:packages` and the test workflow. `build:production` (`--minify --treeshake`, `.d.ts`, no sourcemaps) is what the release workflow publishes. A local `dist/` is therefore unminified by default: judge bundle size and minification against `build:production` output or the published npm tarball.
- **Core stays external in the wrappers.** `@gp-grid/core` is a runtime `dependency` of react/vue/angular, so the bundlers keep it as `import ... from "@gp-grid/core"` instead of inlining it; a wrapper bundle contains only wrapper code. `react`, `react-dom` and `vue` are peer dependencies and external as well.
- **Type-checking reads core sources.** `tsc --noEmit` in react/vue/angular resolves `@gp-grid/core` to `../core/src` through `paths`, so a core API change is checked against the wrappers without rebuilding core. Run it in all three after touching core's public API.
- **Publishing.** npm ships `dist/` (angular: `dist/angular`). JSR ships core's `src/` unbundled (`jsr.json` exports `./src/index.ts`), so everything reachable from `src/index.ts` must be plain TypeScript that resolves without a bundler: CSS lives in `.css` files outside the module graph and generated code is a real file on disk (see Build artifacts).

### Build artifacts

Two files in `packages/core` are produced by the build. Never hand-edit them:

- `dist/styles.css` - bundled from `src/styles/index.css` (which `@import`s the module files in `src/styles/*.css`) with Lightning CSS in `tsdown.config.ts` (`onSuccess`). It is minified only when tsdown runs with `--minify` (`build:production`). The CSS is **not** exported as a JS string; React/Vue/Angular copy this file into their own `dist/`.
- `src/sorting/sort-worker-code.ts` - git-ignored. `scripts/build-worker.ts` bundles and minifies the typed worker source `src/sorting/sort-worker.script.ts` (tsdown, IIFE, in memory) into the `SORT_WORKER_CODE` string that `WorkerPool` loads through a Blob URL. It is regenerated on `pnpm install` (core `prepare` script), before every tsdown build (`build:prepare` hook), before vitest (`tests/global-setup.ts`) and manually with `pnpm --filter @gp-grid/core build:worker`. If the file is missing, run one of those. Edit `sort-worker.script.ts`, never the generated file. JSR publishes from `src/` and skips git-ignored files, so `jsr.json` un-ignores this one via `publish.exclude: ["!src/sorting/sort-worker-code.ts"]` - keep that entry.

## Constraints

- The library shall work also for Server Side Rendering
- Use always `pnpm`
- All the labels related to UI must be configurable to let gp-grid be i18n friendly and configurable

## Code style

- Avoid negated conditions
- Do not use `any`
- Prefer function definitions as constants
- Prefer optional chaining when reading from nullable or optional values
- Prefer `for...of` over index-based `for` loops for simple iteration
- Prefer `.at()` over `[array.length - n]` for relative array access
- Avoid nested ternary operators and in general value human readability
- Keep the cognitive complexity of function to a maximum of 15
- The styling (CSS) is centralized in the `core` package. Use that one as much as you can. Use `:where` to enable styling rewriting from the users
- Reduce inline styling

## Gotchas

- The library `core` package must be library/framework agnostic
- Check type errors with `tsc --noEmit` in the package you changed; after core public-API changes run it in react, vue and angular too (see Build).
- After changes in the public APIs (addition, removal, breaking change) warn the user to update the skill and the public documentation.
