---
title: Building
description: Build repo-edu from source.
---

# Building

Instructions for building repo-edu from source.

## Prerequisites

### Required Tools

| Tool | Version | Check Command |
|------|---------|---------------|
| Node.js | 20+ | `node --version` |
| pnpm | 9+ | `pnpm --version` |
| Rust | stable | `rustc --version` |

### Platform Dependencies

import { Tabs, TabItem } from '@astrojs/starlight/components';

<!-- markdownlint-disable MD033 MD046 -->
<Tabs>
  <TabItem label="macOS">
    ```bash
    xcode-select --install
    ```
  </TabItem>
  <TabItem label="Ubuntu/Debian">
    ```bash
    sudo apt update
    sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
      libssl-dev libayatana-appindicator3-dev librsvg2-dev
    ```
  </TabItem>
  <TabItem label="Fedora">
    ```bash
    sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
      libappindicator-gtk3-devel librsvg2-devel
    ```
  </TabItem>
  <TabItem label="Arch">
    ```bash
    sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module librsvg
    ```
  </TabItem>
  <TabItem label="Windows">
    ```powershell

    # Install Visual Studio Build Tools

    # https://visualstudio.microsoft.com/visual-cpp-build-tools/

    # Install WebView2 Runtime (usually pre-installed on Windows 11)
    # https://developer.microsoft.com/en-us/microsoft-edge/webview2/
    ```
  </TabItem>
</Tabs>
<!-- markdownlint-enable MD033 MD046 -->

## Quick Start

```bash
# Clone the repository
git clone https://github.com/repo-edu/repo-edu.git
cd repo-edu

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri:dev
```

## Build Commands

All commands are run from the repository root:

| Command | Description |
|---------|-------------|
| `pnpm tauri:dev` | Run desktop app in development mode |
| `pnpm tauri:build` | Build debug Tauri app (`.app` only) |
| `pnpm tauri:build:release` | Build release app (`.app` + `.dmg`) |
| `pnpm cli:build` | Build debug CLI |
| `pnpm cli:build:release` | Build release CLI |

## Build Artifacts

### Desktop Application

Build outputs are in `apps/repo-manage/src-tauri/target/release/bundle/`:

| Platform | Format | Location |
|----------|--------|----------|
| macOS | `.app` | `macos/repo-edu.app` |
| macOS | `.dmg` | `dmg/repo-edu_x.y.z_*.dmg` |
| Windows | `.msi` | `msi/repo-edu_x.y.z_*.msi` |
| Windows | `.exe` | `nsis/repo-edu_x.y.z_*.exe` |
| Linux | `.AppImage` | `appimage/repo-edu_*.AppImage` |
| Linux | `.deb` | `deb/repo-edu_*.deb` |

### CLI Binary

The `redu` binary is at:

- Debug: `target/debug/redu`
- Release: `target/release/redu`

## Development Workflow

### Regenerating Type Bindings

After modifying JSON Schemas used by Tauri commands:

```bash
pnpm gen:bindings
```

This updates `apps/repo-manage/src/bindings/types.ts` and
`apps/repo-manage/src/bindings/commands.ts`.

### Testing

```bash
pnpm test        # Run all tests
pnpm test:ts     # Frontend tests only
pnpm test:rs     # Rust tests only
```

### Linting and Formatting

```bash
pnpm fmt         # Format all code
pnpm check       # Check all linting
pnpm fix         # Auto-fix issues
pnpm typecheck   # Type check TS and Rust
pnpm validate    # Run check + typecheck + test
```

## Updating Dependencies

### npm Packages

```bash
# Check for updates
pnpm outdated

# Update all workspaces (interactive)
npx npm-check-updates -u --workspaces
pnpm install
```

### Rust Crates

```bash
# Check for updates
cargo outdated

# Update Cargo.lock
cargo update

# Update to incompatible versions
cargo upgrade --incompatible
```

### pnpm Catalogs

Shared dependency versions are in `pnpm-workspace.yaml`:

```yaml
catalog:
  react: 19.2.1
  typescript: 5.9.3
```

To update: edit the version and run `pnpm install`.

## Troubleshooting

### "WebView2 not found" (Windows)

Install the WebView2 runtime from Microsoft:
<https://developer.microsoft.com/microsoft-edge/webview2/>

### "webkit2gtk not found" (Linux)

Install the correct webkit2gtk package for your distribution. The package name varies:

- Ubuntu/Debian: `libwebkit2gtk-4.1-dev`
- Fedora: `webkit2gtk4.1-devel`
- Arch: `webkit2gtk-4.1`

### Cargo build fails with SSL errors

Ensure OpenSSL development headers are installed:

- Ubuntu/Debian: `libssl-dev`
- Fedora: `openssl-devel`
- macOS: Usually included with Xcode

### Type errors after schema changes

Regenerate bindings:

```bash
pnpm gen:bindings
```

## CI/CD

GitHub Actions workflow for building releases:

```yaml
name: Build
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: aarch64-apple-darwin
          - os: macos-latest
            target: x86_64-apple-darwin
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
          - os: windows-latest
            target: x86_64-pc-windows-msvc

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - run: pnpm install
      - run: pnpm tauri build --target ${{ matrix.target }}

      - uses: actions/upload-artifact@v4
        with:
          name: build-${{ matrix.target }}
          path: apps/repo-manage/src-tauri/target/release/bundle
```

## See Also

- [Architecture](./architecture.md) — Project structure
- [Contributing](./contributing.md) — Development workflow
- [Crates](./crates.md) — Rust crate documentation
