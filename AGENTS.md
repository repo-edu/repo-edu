# Repository Guidelines

## Project Structure & Modules
- Monorepo managed by `pnpm`; shared lockfile at root.
- App: `apps/repo-manage/` — React + Tauri desktop client (`src` for UI, `src-tauri` for Rust backend, `repo-manage-core`/`repo-manage-cli` submodules).
- UI library: `packages/ui/` — reusable React components (exports via `src/components/ui/*`).
- Docs site: `docs/` — Vite-powered documentation; Markdown content under `docs/{getting-started,user-guide,reference}`.
- Tests live beside source using `.test.ts(x)` naming (e.g., `components/FormField.test.tsx`); additional helpers in `apps/repo-manage/src/test/`.

## Build, Test, and Dev Commands
- `pnpm dev:repo-manage` — launch desktop app UI via Vite.
- `pnpm tauri:repo-manage` — run Tauri shell for desktop integration.
- `pnpm build:repo-manage` — type-check + Vite bundle for the app.
- `pnpm docs:dev | docs:build | docs:preview` — docs site dev, static build, or preview.
- `pnpm lint` / `pnpm lint:fix` — Biome lint (optional auto-fix).
- `pnpm typecheck` — TypeScript `--noEmit` for UI + app.
- `pnpm test` — run all package tests (Vitest in app).
- `pnpm check` — lint + typecheck + tests in one go (run before commits/PRs).

## Coding Style & Naming
- Formatting and linting via Biome; prefer 2-space indent, trailing commas, semicolons as emitted by `biome format`.
- React components PascalCase; hooks start with `use*`; shared utilities in `apps/repo-manage/src/utils`.
- Test files mirror subject name with `.test.ts`/`.test.tsx`.
- Markdown follows `markdownlint-cli2`; docs content lives in `docs/**/*.md`.

## Testing Guidelines
- Framework: Vitest with React Testing Library (`@testing-library/react`).
- Keep unit tests colocated with components/adapters; use `test/` helpers for fixtures.
- Name tests by behavior: `ComponentName.test.tsx` with descriptive `it("renders …")` blocks.
- Aim to cover async LMS/git workflows and edge cases (invalid config, missing tokens).
- For changes, run `pnpm test` and `pnpm check`; include new tests for regressions.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`type: concise subject`), mirroring recent history (`chore`, `test`, etc.).
- Keep commits scoped and focused; prefer smaller diffs over sweeping refactors.
- PRs should include: summary of change, steps to reproduce/verify, checklist that `pnpm check` passes, and screenshots/GIFs for UI changes.
- Link related issues/tickets and note any config or migration steps (e.g., updates to `pnpm-workspace.yaml` or settings paths like `~/.config/repo-manage/settings.json` on macOS).

## Security & Configuration Tips
- Do not commit secrets or LMS/Git tokens; use environment variables or OS keychain where possible.
- Verify platform credentials with the in-app configuration before batch operations.
- When adding dependencies, prefer `catalog:` versions in `pnpm-workspace.yaml` to avoid duplication.
