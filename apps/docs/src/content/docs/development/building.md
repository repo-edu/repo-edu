---
title: Building
description: Workspace scripts, per-app targets, integration tests, and packaging
---

## Prerequisites

- **Node.js** — see `.node-version` for the expected version
- **pnpm** — installed globally (`npm install -g pnpm`)

```bash
pnpm install
```

## Workspace scripts

All scripts run from the workspace root. Use `pnpm <script>` to run them.

| Script | What it does |
|--------|--------------|
| `fmt` | Format all TypeScript (Biome) and Markdown (rumdl) files |
| `fix` | Auto-fix lint issues (Biome `--write`) |
| `check` | Full validation: lint + typecheck + build:types + check:fixtures + check:architecture |
| `test` | Run all package-level tests workspace-wide |
| `validate` | `check` + `test` combined — the full pre-commit validation |
| `build` | Build all packages recursively |
| `typecheck` | Run TypeScript type checking across all packages |
| `build:types` | Incremental `tsc -b` using project references |
| `check:architecture` | Verify monorepo dependency rules (no circular deps, boundary compliance) |
| `check:fixtures` | Verify test fixture generation is consistent |

For day-to-day development, `pnpm fmt && pnpm fix` after changes, and `pnpm validate` before committing.

## Per-app commands

### Desktop

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start desktop in dev mode (Electron + Vite HMR) |
| `pnpm --filter @repo-edu/desktop run build` | Production build of the Electron app |
| `pnpm desktop:package:macos:app` | Package as `Repo Edu.app` in `apps/desktop/release/mac-*/` |
| `pnpm desktop:test` | Desktop-specific runtime validation (preload bridge, tRPC wiring) |

### CLI

| Command | Description |
|---------|-------------|
| `pnpm cli:build` | Build the CLI to `apps/cli/dist/` |
| `node apps/cli/dist/redu.js --help` | Run the built CLI |

### Docs

| Command | Description |
|---------|-------------|
| `pnpm docs:dev` | Start Astro dev server with HMR |
| `pnpm docs:build` | Production build of the docs site |
| `pnpm docs:preview` | Build + preview the docs site |
| `pnpm docs:test` | Run docs smoke, workflow alignment, and browser guardrail tests |

## Integration tests

Integration tests run real workflows against live Git providers using Docker containers (Gitea, GitLab) or live APIs (GitHub).

| Command | Provider | Setup |
|---------|----------|-------|
| `pnpm test:integration` | Gitea (default) | Spins up a Gitea Docker container, runs tests, tears down |
| `pnpm test:integration:gitea` | Gitea | Same as above. Configurable via `GITEA_PORT` and `INTEGRATION_GITEA_URL` |
| `pnpm test:integration:gitlab` | GitLab | Spins up GitLab Docker container (slow first start), runs tests, tears down |
| `pnpm test:integration:github` | GitHub | Runs against live GitHub API. Requires `GITHUB_TOKEN` and target org configuration |

GitLab also supports split commands (`test:integration:gitlab:up`, `test:integration:gitlab:run`, `test:integration:gitlab:down`) for keeping the container running across test iterations.

## Utility scripts

| Script | Description |
|--------|-------------|
| `pnpm file-sizes` | Tree-style line/file counts per subfolder. Run `pnpm file-sizes` for options. |
| `pnpm deps:latest` | Upgrade all dependencies to latest versions and dedupe |
