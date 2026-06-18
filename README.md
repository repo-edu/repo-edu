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
pnpm check           # fix + typecheck + build:types + check:fixtures + architecture checks
# Optional full validation (includes tests):
pnpm validate
```

### Run Desktop App

```bash
pnpm dev
```

### Run CLI (`redu`)

```bash
pnpm build:cli
./apps/cli/dist/redu --help
```

CLI and desktop data share the platform app-data root on supported CLI
platforms: macOS `~/Library/Application Support/repo-edu` and Linux
`${XDG_CONFIG_HOME:-~/.config}/repo-edu`. The Windows desktop app stores data
under `%APPDATA%\repo-edu`.

### Install CLI (end-user)

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/repo-edu/repo-edu/main/scripts/install-cli.sh | sh
```

### Run Docs Locally

```bash
pnpm docs:dev
```

## Workspace Scripts

| Command          | Description                                                  |
| ---------------- | ------------------------------------------------------------ |
| `pnpm fmt`       | Biome format + markdown format                               |
| `pnpm fix`       | Biome auto-fix                                               |
| `pnpm check`     | fix + typecheck + build:types + check:fixtures + architecture |
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
    ├── integrations-llm-contract/  # Provider-neutral prompt/reply LLM contract
    ├── integrations-llm/           # Shipped Claude/Codex prompt/reply adapters
    ├── claude-coder/               # Private dev-only Claude Code fixture coder
    ├── test-fixtures/              # Shared domain fixture generation (faker-based)
    └── integration-tests/          # E2E workflow tests against live Git providers
```

## Acknowledgments

- Repository operation concepts are inspired by [RepoBee](https://github.com/repobee/repobee).
- Early Python GUI work was developed by Jingjing Wang.
- The current TypeScript monorepo redesign and Electron desktop app are by Bert van Beek.

## License

MIT. See [LICENSE](LICENSE).

## Proprietary dev dependency

The private `@repo-edu/claude-coder` workspace package depends on
`@anthropic-ai/claude-agent-sdk` for dev-only fixture generation. That SDK is
proprietary and includes non-redistributable Claude Code runtime assets. It is
not part of the released desktop prompt/reply LLM integration, which uses the
redistributable `@anthropic-ai/sdk` package for Claude API-key mode and the
user-installed Claude CLI for subscription mode.
