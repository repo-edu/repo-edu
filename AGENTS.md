# Repository Guidelines

## Project Structure & Module Organization

`repo-edu` is a pnpm + Rust workspace with a desktop app, CLI, shared Rust crates, and docs.

```text
apps/repo-manage/        # Tauri app (React) + CLI + shared Rust core
crates/                  # LMS client crates (canvas/moodle + shared types)
packages/ui/             # Shared UI components
docs/                    # VitePress documentation
scripts/                 # Workspace tooling (schemas, fixtures, agents)
```

Per-area instructions live in subdirectory `AGENTS.md` files (e.g., `crates/AGENTS.md`).

## Build, Test, and Development Commands

```bash
pnpm install             # Install workspace dependencies
pnpm tauri:dev            # Run the desktop app locally
pnpm cli:build            # Build the CLI (debug)
pnpm build                # Build the desktop app
pnpm fmt                  # Format TS, Rust, and Markdown
pnpm check                # Lint + typecheck + schema checks
pnpm test                 # Run all tests (TS + Rust)
pnpm docs:dev             # Preview docs locally
```

If JSON schemas change, regenerate bindings:

```bash
pnpm gen:bindings
```

## Coding Style & Naming Conventions

- TypeScript/React: Biome formatting (2-space indent, double quotes, semicolons as needed). Use
  `PascalCase` for components, `camelCase` for functions, and `useX` for hooks.
- Rust: rustfmt + clippy; prefer `snake_case` for modules/functions and `PascalCase` for types.
- Do not hand-edit generated bindings in `apps/repo-manage/src/bindings/`.

## Testing Guidelines

- Frontend tests use Vitest and live under `apps/repo-manage/src/**/*.test.ts(x)`.
  Run with `pnpm test:ts`.
- Rust tests use `cargo test` and live in `crates/**/tests` or `mod tests` blocks.
  Run with `pnpm test:rs` or `cargo test -p repo-manage-core`.
- `pnpm validate` runs checks + tests for a full pre-PR pass.

## Commit & Pull Request Guidelines

- Commit messages use conventional prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
  `chore:`. Keep them short and imperative (e.g., `fix: handle empty roster`).
- Before PRs: run `pnpm fmt` and `pnpm validate`; regenerate bindings when schemas change.
- PR descriptions should include what changed, why, how to test, and screenshots for UI changes.

## Documentation & Configuration Notes

- Docs live in `docs/`; update navigation in `docs/.vitepress/config.ts`.
- Shared dependency versions are managed via pnpm catalogs in `pnpm-workspace.yaml`.
