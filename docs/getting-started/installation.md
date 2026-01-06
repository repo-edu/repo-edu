# Installation

## Desktop Application

### Download

::: warning Work in Progress
Binary downloads will be available when releases are published on GitHub.
:::

repo-edu is available for:

| Platform | Architecture | Format |
|----------|--------------|--------|
| macOS | Apple Silicon (arm64) | `.dmg` |
| macOS | Intel (x64) | `.dmg` |
| Windows | 64-bit | `.msi` |
| Linux | 64-bit | `.AppImage` |

### System Requirements

| Platform | Requirements |
|----------|--------------|
| macOS | macOS 11 (Big Sur) or later |
| Windows | Windows 10 or later, WebView2 runtime |
| Linux | GTK 3, WebKit2GTK 4.1 |

### First Launch

On first launch, repo-edu creates a configuration directory:

| Platform | Location |
|----------|----------|
| macOS | `~/Library/Application Support/repo-edu/` |
| Windows | `%APPDATA%\repo-edu\` |
| Linux | `~/.config/repo-edu/` |

### macOS Security

On first launch, macOS may block the app. To allow it:

1. Right-click the app and select **Open**
2. Click **Open** in the dialog
3. Alternatively: **System Preferences** → **Security & Privacy** → **Open Anyway**

## CLI Installation

The `redu` CLI can be installed separately for automation and scripting.

### From Source (Recommended)

```bash
# Clone the repository
git clone https://github.com/repo-edu/repo-edu.git
cd repo-edu

# Build and install
cargo install --path apps/repo-manage/repo-manage-cli
```

### Verify Installation

```bash
redu --version
redu --help
```

## Building from Source

See [Building](../development/building.md) for complete build instructions.

### Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm, Rust

# Clone
git clone https://github.com/repo-edu/repo-edu.git
cd repo-edu

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri:dev

# Build for production
pnpm tauri:build
```

## Updating

### Desktop Application

Download the latest release and replace the existing application.

### CLI

```bash
cd repo-edu
git pull
cargo install --path apps/repo-manage/repo-manage-cli --force
```

## Uninstalling

### macOS

1. Move repo-edu from Applications to Trash
2. Optionally remove configuration:

   ```bash
   rm -rf ~/Library/Application\ Support/repo-edu
   ```

### Windows

1. Use **Add or Remove Programs**
2. Optionally remove configuration:

   ```powershell
   Remove-Item -Recurse $env:APPDATA\repo-edu
   ```

### Linux

1. Delete the AppImage
2. Optionally remove configuration:

   ```bash
   rm -rf ~/.config/repo-edu
   ```

### CLI

```bash
cargo uninstall redu
```
