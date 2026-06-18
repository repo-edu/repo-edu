---
title: CLI Installation
description: Install and run the redu CLI
---

## Quick install

The release installer supports macOS and Linux.

```bash
curl -fsSL https://raw.githubusercontent.com/repo-edu/repo-edu/main/scripts/install-cli.sh | sh
```

Override the install directory with `REDU_INSTALL_DIR` or pin a version with `REDU_VERSION`:

```bash
REDU_VERSION=v0.1.0 REDU_INSTALL_DIR=/usr/local/bin curl -fsSL ... | sh
```

## Direct download

If you would rather not run the install script, download a binary directly. Each link resolves to the latest release:

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | [redu-darwin-arm64](https://github.com/repo-edu/repo-edu/releases/latest/download/redu-darwin-arm64) |
| Linux (x64) | [redu-linux-x64](https://github.com/repo-edu/repo-edu/releases/latest/download/redu-linux-x64) |
| Linux (ARM64) | [redu-linux-arm64](https://github.com/repo-edu/repo-edu/releases/latest/download/redu-linux-arm64) |

Then mark it executable and move it onto your PATH:

```bash
chmod +x redu-linux-x64
mv redu-linux-x64 ~/.local/bin/redu
```

A matching `.sha256` checksum and a `.third-party-notices.txt` file are attached to the same release. The CLI is not distributed for Windows.

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

The CLI and desktop app store course and settings data under the same platform app-data root on supported CLI platforms: macOS `~/Library/Application Support/repo-edu` and Linux `${XDG_CONFIG_HOME:-~/.config}/repo-edu`.
