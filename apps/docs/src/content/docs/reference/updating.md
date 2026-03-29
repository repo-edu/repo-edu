---
title: Updating
description: How to update the desktop app and CLI
---

## Desktop app

The desktop app checks for updates automatically after startup and every 4 hours while running. When an update is available:

1. A notification prompts you to download.
2. After the download completes, you can restart to apply the update.
3. If you dismiss the prompt, the update installs automatically on the next quit.

You can also trigger updates manually from the app menu:

- **macOS**: `Repo Edu` -> `Check for Updates...`
- **Windows / Linux**: `Help` -> `Check for Updates...`

Updates use blockmap-based deltas where possible, so only changed bytes are downloaded.

### Per-platform details

- **macOS** — the auto-updater downloads a zip artifact from the GitHub Release and replaces the app bundle. The DMG is only used for first-time installation.
- **Windows** — the auto-updater downloads and silently runs an NSIS installer to apply the update.
- **Linux** — AppImage auto-update is handled natively by electron-updater.

## CLI (`redu update`)

Update to the latest release:

```bash
redu update
```

Check for updates without installing:

```bash
redu update --check
```

On macOS and Linux, the binary is replaced atomically. On Windows, the new binary is downloaded to the install directory and takes effect on the next run.

### Install scripts

If you installed via the install script, you can also re-run it to update:

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/repo-edu/repo-edu/main/scripts/install-cli.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/repo-edu/repo-edu/main/scripts/install-cli.ps1 | iex
```
