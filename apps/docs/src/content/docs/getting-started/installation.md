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

This runs formatting fixes, type checks, declaration builds, fixture checks, and architecture checks. If everything passes, your environment is ready. Run `pnpm test` separately when you need the full package test suite.

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

The release installer supports macOS and Linux.

```bash
curl -fsSL https://raw.githubusercontent.com/repo-edu/repo-edu/main/scripts/install-cli.sh | sh
```

### Docs site

```bash
pnpm docs:dev
```

Starts the documentation site locally with an embedded interactive demo.

## Data directory

The CLI and desktop app share the platform app-data root on supported CLI platforms: macOS `~/Library/Application Support/repo-edu` and Linux `${XDG_CONFIG_HOME:-~/.config}/repo-edu`. The Windows desktop app stores data under `%APPDATA%\repo-edu`.
