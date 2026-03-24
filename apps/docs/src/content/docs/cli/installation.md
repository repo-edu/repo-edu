---
title: CLI Installation
description: Build and run the redu CLI
---

The `redu` CLI is built from source as part of the repo-edu workspace.

## Build

```bash
pnpm cli:build
```

## Verify the installation

```bash
redu --help
```

This prints the available commands and global options.

## Run a command

```bash
redu course list
```

## Data directory

The CLI stores course and settings data in `~/.repo-edu/` by default. To use a different directory, set the `REPO_EDU_CLI_DATA_DIR` environment variable:

```bash
REPO_EDU_CLI_DATA_DIR=/path/to/data redu course list
```

The desktop app and CLI share the same data format, but their default storage locations are different. If you use both, configure them to point to the same directory or copy data between them.
