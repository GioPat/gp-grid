# gp-grid

gp-grid is a library that allows user to manage tables and grids. The ideas behind gp-grid is to give users a tool with "batteries included" but give room for full customizability. One of the core principle is the bundle size, allowing users to manage gp-grid in resource constrained (memory, bundle) environments so it cannot include external dependencies. Another core principle is the DX (Developer Experience)

It's composed by a core package which is framework/library agnostic managing all the core logic (custom virtualization, state management, etc.) and thin wrappers (react, vue, angular) that are wiring the core to the respective technology.

The features that the library must support are:

- Basic visualization of the grid with virtualization
- Custom renderers for Cells, Edit mode cells and headers
- Filtering and sorting
- Keyboard navigation commands
- Columns resizing, moving, hiding
- Row dragging (Entire or column specific handle)
- Editing of the cells with fill handle
- Custom highlighting: callbacks returning classes for the columns and rows, this allows to implement also crosshairs highlighting
- Programmatic API to manage all the features of the library

## Commands

- Use `pnpm` always

## Build artifacts

Two files in `packages/core` are produced by the build. Never hand-edit them:

- `dist/styles.css` - bundled from `src/styles/index.css` (which `@import`s the module files in `src/styles/*.css`) with Lightning CSS in `tsdown.config.ts` (`onSuccess`). It is minified only when tsdown runs with `--minify` (`build:production`). The CSS is **not** exported as a JS string; React/Vue/Angular copy this file into their own `dist/`.
- `src/sorting/sort-worker-code.ts` - git-ignored. `scripts/build-worker.ts` bundles and minifies the typed worker source `src/sorting/sort-worker.script.ts` (tsdown, IIFE, in memory) into the `SORT_WORKER_CODE` string that `WorkerPool` loads through a Blob URL. It is regenerated on `pnpm install` (core `prepare` script), before every tsdown build (`build:prepare` hook), before vitest (`tests/global-setup.ts`) and manually with `pnpm --filter @gp-grid/core build:worker`. If the file is missing, run one of those. Edit `sort-worker.script.ts`, never the generated file.

## Constraints

- The library should work also for Server Side Rendering

## Code style

- Avoid negated conditions
- Avoid using `any`
- Prefer function definitions as constants
- Avoid nested ternary operators and in general value human readability
- Keep the cognitive complexity of function to a maximum of 15
- The styling (CSS) is centralized in the `core` package. Use that one as much as you can. Use `:where` to enable styling rewriting from the users
- Reduce inline styling

## Architecture

- Core is available at `packages/core`
- React wrapper is available at `packages/react`
- Vue wrapper is available at `packages/vue`
- Angular wrapper is available at `packages/angular`
- Playgrounds are available at `playgrounds`

## Gotchas

- The library `core` package must be library/framework agnostic
- Check LSP type errors with the `tsc --noEmit` command.
