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
- Check LSP type errors
