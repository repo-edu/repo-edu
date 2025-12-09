# Building

Instructions for building RepoManage from source.

## Prerequisites

- Node.js 20+
- pnpm
- Rust (latest stable)
- Platform-specific dependencies (see below)

### macOS

```bash
xcode-select --install
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Windows

- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

## Development Build

```bash
cd apps/repo-manage
pnpm tauri dev
```

## Production Build

```bash
cd apps/repo-manage
pnpm tauri build
```

Build artifacts are located in:

- macOS: `src-tauri/target/release/bundle/dmg/`
- Windows: `src-tauri/target/release/bundle/msi/`
- Linux: `src-tauri/target/release/bundle/appimage/`

## Regenerating Bindings

After modifying Rust types, regenerate TypeScript bindings:

```bash
pnpm gen:bindings
```

## Dependency Management

This monorepo uses pnpm catalogs for consistent dependency versions. See the main README for details.

### Updating Dependencies

```bash
# Update npm packages (all workspaces)
npx npm-check-updates -u --workspaces
pnpm install

# Update Rust packages
cargo upgrade --incompatible
```
