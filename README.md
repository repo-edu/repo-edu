# repo-edu

[![CI](https://github.com/repo-edu/repo-edu/actions/workflows/ci.yml/badge.svg)](https://github.com/repo-edu/repo-edu/actions/workflows/ci.yml)
[![Docs](https://github.com/repo-edu/repo-edu/actions/workflows/docs.yml/badge.svg)](https://github.com/repo-edu/repo-edu/actions/workflows/docs.yml)

> Active development — contracts and command output may change.

Import rosters from your LMS, manage student repositories, and validate assignments — from a desktop app or the command line.

**[Documentation](https://repo-edu.github.io/repo-edu/)** |
**[Interactive Demo](https://repo-edu.github.io/repo-edu/demo/)** |
**[Getting Started](https://repo-edu.github.io/repo-edu/getting-started/installation/)**

## Features

- **LMS integration** (Canvas, Moodle) — verify connections, import rosters, sync group sets.
- **Git provider integration** (GitHub, GitLab, Gitea) — verify connections, plan/create/clone/delete repositories.
- **Desktop app** — interactive workflows for roster importing and repository management.
- **CLI (`redu`)** — scripted operations for validation and CI pipelines.
- **Browser demo** — the real desktop app running in your browser against mock data, no installation required.
- **Shared business logic** across all targets via typed workflows and a [ports-and-adapters architecture](https://repo-edu.github.io/repo-edu/development/architecture/).

## Quick Start

### Prerequisites

- Node.js 24+
- pnpm 10+

### Install and Check

```bash
git clone https://github.com/repo-edu/repo-edu.git
cd repo-edu
pnpm install
pnpm check           # lint + typecheck + build:types + check:fixtures + architecture checks
# Optional full validation (includes tests):
pnpm validate
```

### Run Desktop App

```bash
pnpm dev
```

### Run CLI (`redu`)

```bash
pnpm cli:build
node apps/cli/dist/index.js --help
```

CLI data is stored under `~/.repo-edu` by default. Override with `REPO_EDU_CLI_DATA_DIR`.

### Run Docs Locally

```bash
pnpm docs:dev
```

## Workspace Scripts

| Command          | Description                                                  |
| ---------------- | ------------------------------------------------------------ |
| `pnpm fmt`       | Biome format + markdown format                               |
| `pnpm fix`       | Biome auto-fix                                               |
| `pnpm check`     | lint + typecheck + build:types + check:fixtures + architecture |
| `pnpm test`      | Run all package tests workspace-wide                         |
| `pnpm validate`  | `check` + `test` (full validation)                           |
| `pnpm dev`       | Run desktop Electron app                                     |
| `pnpm docs:dev`  | Run docs dev server                                          |
| `pnpm file-sizes`| Tree-style line/file counts per subfolder                    |

## Workspace Structure

```text
repo-edu/
├── apps/
│   ├── desktop/                    # Electron shell (main/preload/renderer bridge)
│   ├── cli/                        # TypeScript CLI (redu)
│   └── docs/                       # Starlight docs site + browser-safe demo
└── packages/
    ├── domain/                     # Pure domain logic + invariants
    ├── application/                # Workflow orchestration / use-cases
    ├── application-contract/       # Typed workflow catalog + client contract
    ├── renderer-app/               # Shared React application
    ├── ui/                         # Shared UI component library
    ├── renderer-host-contract/     # Renderer-safe host capability contract
    ├── host-runtime-contract/      # Runtime port contracts (http/process/fs)
    ├── host-node/                  # Node host adapters
    ├── host-browser-mock/          # Browser/mock adapters for docs/tests
    ├── integrations-lms-contract/  # LMS integration contract
    ├── integrations-lms/           # LMS integration implementations
    ├── integrations-git-contract/  # Git provider integration contract
    ├── integrations-git/           # Git provider integration implementations
    ├── test-fixtures/              # Shared domain fixture generation (faker-based)
    └── integration-tests/          # E2E workflow tests against live Git providers
```

## Acknowledgments

- Repository operation concepts are inspired by [RepoBee](https://github.com/repobee/repobee).
- Early Python GUI work was developed by Jingjing Wang.
- The current TypeScript monorepo redesign and Electron desktop app are by Bert van Beek.

## License

Dual-licensed under MIT or Apache-2.0.
