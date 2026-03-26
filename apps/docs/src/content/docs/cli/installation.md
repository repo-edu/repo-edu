---
title: CLI Installation
description: Install and run the redu CLI
---

## Quick install

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/repo-edu/repo-edu/main/scripts/install-cli.sh | sh
```

Override the install directory with `REDU_INSTALL_DIR` or pin a version with `REDU_VERSION`:

```bash
REDU_VERSION=v0.1.0 REDU_INSTALL_DIR=/usr/local/bin curl -fsSL ... | sh
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/repo-edu/repo-edu/main/scripts/install-cli.ps1 | iex
```

## Build from source

```bash
pnpm build:cli
./apps/cli/dist/redu --help
```

## Verify the installation

```bash
redu --help
```

This prints the available commands and global options.

## Update

```bash
redu update
```

Check for updates without installing:

```bash
redu update --check
```

## Data directory

The CLI stores course and settings data in `~/.repo-edu/` by default. To use a different directory, set the `REPO_EDU_CLI_DATA_DIR` environment variable:

```bash
REPO_EDU_CLI_DATA_DIR=/path/to/data redu course list
```

The desktop app and CLI share the same data format, but their default storage locations are different. If you use both, configure them to point to the same directory or copy data between them.
