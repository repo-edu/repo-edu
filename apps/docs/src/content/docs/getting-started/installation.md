---
title: Installation
description: Install and validate the Electron/CLI/docs TypeScript workspace
---

## Prerequisites

- Node.js 24 (recommended in this repository)
- pnpm 10+

## Install dependencies

```bash
pnpm install
```

## Validate the workspace

```bash
pnpm validate
```

This runs linting, type checks, and tests across workspace packages and apps.

## Run targets

### Electron desktop

```bash
pnpm dev
```

### CLI (`redu`)

```bash
pnpm cli:build
node apps/cli/dist/index.js --help
```

### Docs site

```bash
pnpm --filter @repo-edu/docs run dev
pnpm --filter @repo-edu/docs run build
pnpm --filter @repo-edu/docs run preview
```

## Optional CLI storage override

By default, CLI data is stored in `~/.repo-edu`.

```bash
REPO_EDU_CLI_DATA_DIR=/tmp/repo-edu-cli node apps/cli/dist/index.js course list
```
