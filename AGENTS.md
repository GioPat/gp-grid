# gp-grid

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

## Build artifacts

Two files in `packages/core` are produced by the build. Never hand-edit them:

- `dist/styles.css` - bundled from `src/styles/index.css` (which `@import`s the module files in `src/styles/*.css`) with Lightning CSS in `tsdown.config.ts` (`onSuccess`). It is minified only when tsdown runs with `--minify` (`build:production`). The CSS is **not** exported as a JS string; React/Vue/Angular copy this file into their own `dist/`.
- `src/sorting/sort-worker-code.ts` - git-ignored. `scripts/build-worker.ts` bundles and minifies the typed worker source `src/sorting/sort-worker.script.ts` (tsdown, IIFE, in memory) into the `SORT_WORKER_CODE` string that `WorkerPool` loads through a Blob URL. It is regenerated on `pnpm install` (core `prepare` script), before every tsdown build (`build:prepare` hook), before vitest (`tests/global-setup.ts`) and manually with `pnpm --filter @gp-grid/core build:worker`. If the file is missing, run one of those. Edit `sort-worker.script.ts`, never the generated file.

## Constraints

- The library shall work also for Server Side Rendering
- Use always `pnpm`

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
- Check LSP type errors with the `tsc --noEmit` command.
- After changes in the public APIs (addition, removal, breaking change) warn the user to update the skill and the public documentation.
