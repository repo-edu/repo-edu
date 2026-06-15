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

The CLI and desktop app store course and settings data under the same platform app-data root: macOS `~/Library/Application Support/repo-edu`, Linux `${XDG_CONFIG_HOME:-~/.config}/repo-edu`, and Windows `%APPDATA%\repo-edu`.
