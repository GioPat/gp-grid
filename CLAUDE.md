# gp-grid

High cardinality Grid library for web pages with wrappers in the most common frameworks/libs.

## Commands

- Use `pnpm` always

## Code style

- Avoid using `any`
- Prefer function definitions as constants

## Architecture

- Core is available at `packages/core`
- React wrapper is available at `packages/react`
- Vue wrapper is available at `packages/vue`
- Playgrounds are available at `playgrounds`

## Gotchas

- The library `core` package must be library/framework agnostic
- Check LSP type errors
