# Contributing to gp-grid

Thanks for taking the time to contribute to gp-grid. Contributions are not
limited to code: financial support, bug reports, ideas, documentation, tests,
and examples all help the project.

gp-grid aims to provide a feature-rich grid library while keeping the core
small, framework-agnostic, SSR-compatible, and free of external runtime
dependencies.

## Ways to Contribute

### Financial Support

If gp-grid is useful to you or your company, financial support helps sustain
maintenance and development.

- GitHub Sponsors: see the sponsor button on the repository.
- PayPal: see `.github/FUNDING.yml` for the configured donation link.

### Issues and Ideas

Open an issue when you find a bug, have a feature request, or want to discuss
an idea before implementing it.

Good issues usually include:

- The package or wrapper involved: core, React, Vue, Angular, or playground.
- A small reproduction or clear steps to reproduce.
- Expected behavior and actual behavior.
- Browser, framework, and package versions when relevant.
- Screenshots, recordings, or performance traces for UI/scrolling issues.

For large feature ideas, start with an issue before opening a pull request.
This keeps the implementation aligned with the project goals and avoids wasted
work.

### Documentation, Examples, and Tests

Documentation fixes, clearer examples, and focused tests are welcome. These are
often the best way to contribute if you are not ready to change library code.

### Code Contributions

Code contributions should stay scoped, readable, and aligned with the existing
architecture.

## Project Structure

- `packages/core`: framework-agnostic grid logic, virtualization, state, input handling, and shared styles.
- `packages/react`: React wrapper around core.
- `packages/vue`: Vue wrapper around core.
- `packages/angular`: Angular wrapper around core.
- `playgrounds`: local demos used for development and manual verification.

## Development Setup

Use `pnpm` for all package management and scripts.

```sh
pnpm install
```

Common commands:

```sh
pnpm --filter @gp-grid/core test
pnpm test:coverage
pnpm --filter ./packages/core build
pnpm --filter ./packages/react build
pnpm --filter ./packages/vue build
pnpm --filter ./packages/angular build
pnpm dev
pnpm dev:vue
pnpm dev:angular
```

Before opening a pull request, run the relevant tests and type checks for the
packages you changed. At minimum, check TypeScript with `tsc --noEmit`.

## Quality Gates and Pipelines

Pull requests should be ready for the repository quality pipeline.

The `Build` GitHub Actions workflow installs dependencies, builds the core
package, runs coverage with `pnpm test:coverage`, and sends analysis to
SonarQube for:

- `packages/core/src`
- `packages/react/src`
- `packages/vue/src`

SonarQube is used for code quality, maintainability, and coverage visibility.
Keep new code simple enough to pass quality checks without suppressions.

The core package should keep high test coverage. Do not reduce core coverage
below 90%; when changing core behavior, add or update focused tests under
`packages/core/tests`.

The release workflow builds production packages before publishing. Public API
changes should be intentional, documented, and reflected in tests.

## Coding Guidelines

- Keep `packages/core` framework-agnostic and free of external runtime dependencies.
- Preserve SSR compatibility; browser APIs must be guarded.
- Prefer simple, readable code over clever abstractions.
- Avoid `any`.
- Avoid negated conditions when a positive branch reads clearly.
- Prefer function definitions as constants.
- Prefer optional chaining when reading from nullable or optional values.
- Prefer `for...of` over index-based `for` loops for simple iteration.
- Prefer `.at()` over `[array.length - n]` for relative array access.
- Avoid nested ternary expressions.
- Keep function cognitive complexity low.
- Centralize styling in `packages/core` where possible.
- Use `:where(...)` in core styles so users can override styling easily.
- Reduce inline styles in wrappers and playgrounds.

## Testing Expectations

Add or update tests when behavior changes. Keep tests focused on the affected
package and broaden coverage when a change touches shared behavior or wrapper
contracts.

For core changes, prefer focused tests under `packages/core/tests` and verify
coverage remains above 90%.

For wrapper changes, verify the affected wrapper and use the relevant
playground for manual checks when UI behavior changes.

For documentation-only changes, tests are usually not required.

## Pull Request Checklist

- The contribution type is clear: funding, issue, idea, docs, tests, or code.
- The change is scoped to the requested behavior.
- Public API changes are intentional and documented.
- Core changes remain framework-agnostic and dependency-free.
- SSR-sensitive code guards browser-only APIs.
- Tests and type checks relevant to the changed packages pass.
- Core coverage remains above 90% for core changes.
- SonarQube quality issues introduced by the change are addressed.
- Playground-only diagnostics are gated or removed before merging.
