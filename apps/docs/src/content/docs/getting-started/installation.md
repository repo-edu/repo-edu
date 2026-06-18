---
title: Installation
description: Download and install the repo-edu desktop app or CLI
---

repo-edu ships as a desktop app and a command-line tool (`redu`). Both are pre-built, so installing needs nothing else on your machine. To explore the interface first without installing anything, open the [Interactive Demo](/repo-edu/demo/).

## Desktop app

Download the installer for your platform:

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | [RepoEdu-mac-arm64.dmg](https://github.com/repo-edu/repo-edu/releases/latest/download/RepoEdu-mac-arm64.dmg) |
| Windows (x64) | [RepoEdu-win-x64.exe](https://github.com/repo-edu/repo-edu/releases/latest/download/RepoEdu-win-x64.exe) |
| Windows (ARM64) | [RepoEdu-win-arm64.exe](https://github.com/repo-edu/repo-edu/releases/latest/download/RepoEdu-win-arm64.exe) |
| Linux, Debian/Ubuntu (x64) | [RepoEdu-linux-amd64.deb](https://github.com/repo-edu/repo-edu/releases/latest/download/RepoEdu-linux-amd64.deb) |
| Linux, Debian/Ubuntu (ARM64) | [RepoEdu-linux-arm64.deb](https://github.com/repo-edu/repo-edu/releases/latest/download/RepoEdu-linux-arm64.deb) |

Each link resolves to the matching installer in the latest release.

### macOS

Open the downloaded `.dmg` and drag **RepoEdu** into Applications. The app is signed and notarized, so it launches without a Gatekeeper override. Builds are Apple Silicon only; Intel Macs are not supported.

### Windows

Run the downloaded `.exe`. The installers are unsigned, so the first launch shows a SmartScreen prompt. Choose **More info**, then **Run anyway**. Later updates install through the app and do not show the prompt. See [Windows Distribution](/repo-edu/development/windows-distribution/) for why the installers are unsigned.

### Linux

Install the downloaded package:

```bash
sudo apt install ./RepoEdu-linux-amd64.deb
```

The desktop app supports the Debian family only (Debian, Ubuntu, Mint and derivatives). Fedora, RHEL, openSUSE and Arch are not supported desktop targets. See [Linux Packaging](/repo-edu/development/linux-packaging/) for why the app ships as a deb.

## CLI (`redu`)

The CLI is distributed for macOS and Linux. The install script detects your platform, verifies the download checksum, and installs the binary onto your PATH:

```bash
curl -fsSL https://raw.githubusercontent.com/repo-edu/repo-edu/main/scripts/install-cli.sh | sh
```

Override the install directory with `REDU_INSTALL_DIR` or pin a version with `REDU_VERSION`. See [CLI Installation](/repo-edu/cli/installation/) for details.

If you would rather not run the script, download a binary directly:

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

The CLI is not distributed for Windows; use the desktop app there.

## Next steps

Once installed, the [Quick Start](/repo-edu/getting-started/quick-start/) walks through first use of the desktop app and the CLI.

## Install from source

Building or contributing to repo-edu is covered in the [Building](/repo-edu/development/building/) guide.

## Data directory

The CLI and desktop app share the platform app-data root on supported CLI platforms: macOS `~/Library/Application Support/repo-edu` and Linux `${XDG_CONFIG_HOME:-~/.config}/repo-edu`. The Windows desktop app stores data under `%APPDATA%\repo-edu`.
