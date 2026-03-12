---
title: CLI Installation
description: Build and run the in-repo TypeScript CLI
---

`redu` is currently built from this repository.

## Build

```bash
pnpm cli:build
```

## Run help

```bash
node apps/cli/dist/index.js --help
```

## Run a command

```bash
node apps/cli/dist/index.js course list
```

## Data directory

Default:

- `~/.repo-edu`

Override:

```bash
REPO_EDU_CLI_DATA_DIR=/tmp/repo-edu-cli node apps/cli/dist/index.js course list
```
