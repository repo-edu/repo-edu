---
title: Installation
description: Set up the repo-edu development environment
---

## Prerequisites

- **Node.js 24** or later
- **pnpm 10** or later

## Install dependencies

Clone the repository and install all workspace dependencies:

```bash
git clone <repo-url>
cd repo-edu
pnpm install
```

## Validate the installation

```bash
pnpm check
```

This runs linting, type checks, and tests across all packages and apps. If everything passes, your environment is ready.

## Run targets

### Desktop app

```bash
pnpm dev
```

Opens the Electron desktop application. This is the primary interface for managing courses, importing rosters, and running repository operations interactively.

### CLI (`redu`) — from source

```bash
pnpm build:cli
./apps/cli/dist/redu --help
```

The CLI provides command-line access to course and repository operations. See [CLI Overview](/repo-edu/cli/overview/) for the full command reference.

### CLI (`redu`) — end-user install

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/repo-edu/repo-edu/main/scripts/install-cli.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/repo-edu/repo-edu/main/scripts/install-cli.ps1 | iex
```

### Docs site

```bash
pnpm docs:dev
```

Starts the documentation site locally with an embedded interactive demo.

## CLI data directory

By default, the CLI stores course and settings data in `~/.repo-edu/`. To use a different location:

```bash
REPO_EDU_CLI_DATA_DIR=/path/to/data redu course list
```
