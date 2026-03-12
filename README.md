# repo-edu

> Pre-alpha: active development, breaking changes expected.

`repo-edu` is a TypeScript monorepo for educational repository management. It combines:

- an Electron desktop app
- a TypeScript CLI (`redu`)
- a browser-safe docs/demo runtime

The project streamlines workflows around LMS rosters/group sets and Git repository operations.

## Features

- LMS integration (Canvas, Moodle): verify connections, import rosters, sync group sets.
- Git provider integration (GitHub, GitLab, Gitea): verify connections, plan/create/clone/delete repositories.
- Shared business logic across desktop, CLI, and docs via typed workflows.
- Browser-safe docs demo backed by in-memory/mock host adapters.

## Migration Context

This repository is the greenfield TypeScript rewrite of `repo-edu-tauri`:

- no Rust
- no Tauri runtime
- no generated backend bindings
- no legacy settings/profile migration logic

## Quick Start

### Prerequisites

- Node.js (recent LTS; tested in this repo with Node 24)
- pnpm 10+

### Install

```bash
pnpm install
```

### Validate workspace

```bash
pnpm validate
```

### Run desktop app (Electron)

```bash
pnpm dev
```

### Generate macOS `.app` bundle

```bash
pnpm desktop:package:macos:app
```

This outputs `Repo Edu.app` under `apps/desktop/release/mac-*/`.

### Run CLI (`redu`)

```bash
pnpm cli:build
node apps/cli/dist/index.js --help
```

CLI data is stored under `~/.repo-edu` by default. Override with:

```bash
REPO_EDU_CLI_DATA_DIR=/path/to/data node apps/cli/dist/index.js profile list
```

### Build and test docs demo harness

```bash
pnpm docs:build
pnpm docs:test
```

### Run desktop bridge validation checks

```bash
pnpm desktop:validate
```

## Workspace Structure

```text
repo-edu/
├── apps/
│   ├── desktop/                 # Electron shell (main/preload/renderer bridge)
│   ├── cli/                     # TypeScript CLI (redu)
│   └── docs/                    # Browser-safe docs/demo harness
└── packages/
    ├── app/                     # Shared React app
    ├── ui/                      # Shared UI components
    ├── domain/                  # Pure domain logic + invariants
    ├── application/             # Workflow orchestration/use-cases
    ├── application-contract/    # Typed workflow catalog + client contract
    ├── renderer-host-contract/  # Renderer-safe host capability contract
    ├── host-runtime-contract/   # Runtime port contracts
    ├── host-node/               # Node host adapters (fs/process/http/git)
    ├── host-browser-mock/       # Browser/mock adapters for docs/tests
    ├── test-fixtures/           # Canonical shared fixtures + source overlays
    ├── integrations-lms-contract/ # LMS integration contract
    ├── integrations-lms/          # LMS integration implementations
    ├── integrations-git-contract/ # Git/provider integration contract
    └── integrations-git/          # Git/provider integration implementations
```

## Current Notes

- Desktop transport uses `trpc-electron` (tRPC v11 compatible).
- Electron preload output is CommonJS (`preload.cjs`) for sandbox/runtime compatibility.
- Some XLSX file flows remain intentionally deferred where binary file-port support is required.

## Acknowledgments

- Repository operation concepts are inspired by [RepoBee](https://github.com/repobee/repobee).
- Early Python GUI work was developed by Jingjing Wang.
- The Tauri generation and the current Electron rewrite are by Bert van Beek.

## License

Dual-licensed under MIT or Apache-2.0 (see `LICENSE-MIT` and `LICENSE-APACHE`).
