# RepoBee Tauri

A modern desktop application for managing student repositories, built with Tauri, React, and TypeScript.

## Overview

RepoBee Tauri is a GUI application for educators to manage student repositories across multiple Git platforms (GitHub, GitLab, Gitea) and integrate with learning management systems (Canvas, Moodle, ...).

## Features

- **LMS Integration**: Import student data from Canvas or Moodle courses
- **Multi-Platform Git Support**: Works with GitHub, GitLab, Gitea, and local filesystems
- **Repository Setup**: Create student repositories from templates
- **Repository Cloning**: Clone all student repositories with customizable layouts
- **Persistent Settings**: Save and restore your configuration
- **JSON Schema Validation**: Type-safe settings with automatic validation

## Getting Started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Node.js](https://nodejs.org/) (v18 or later)
- [pnpm](https://pnpm.io/installation)

### Installation

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

## Project Structure

```
repobee-tauri/
├── src/                    # React frontend
├── src-tauri/             # Tauri backend (Rust)
├── repobee-core/          # Core library (Git/LMS operations)
│   ├── src/
│   │   ├── lms/           # LMS integration
│   │   ├── platform/      # Git platform abstractions
│   │   ├── settings/      # Settings management
│   │   └── setup/         # Repository setup logic
│   └── examples/          # Example programs
└── repobee-cli/           # CLI application (future)
```

## Settings System

### Overview

Settings are persisted to platform-specific locations:
- **macOS**: `~/Library/Application Support/repobee-tauri/repobee.json`
- **Linux**: `~/.config/repobee-tauri/repobee.json`
- **Windows**: `%APPDATA%\repobee-tauri\repobee.json`

### JSON Schema Validation

All settings are validated against a JSON schema to ensure type safety and prevent invalid configurations.

#### Regenerating the Schema

If you modify the settings structure, regenerate the schema documentation:

```bash
cargo run --package repobee-core --example generate_schema
```

This creates `settings-schema.json` which can be used for:
- Documentation of all available settings
- IDE autocomplete in JSON editors (VSCode, etc.)
- External validation tools
- API documentation generation

#### Using the Schema in Your Editor

**VSCode**: Add to your `repobee.json` file:
```json
{
  "$schema": "./settings-schema.json",
  "common": {
    "lms_base_url": "https://canvas.tue.nl",
    ...
  }
}
```

This enables autocomplete and validation while editing settings.

### Settings Structure

Settings are organized into two levels:

1. **CommonSettings**: Shared between GUI and CLI
   - LMS configuration (URL, tokens, course info)
   - Git platform configuration (URL, tokens, organization)
   - Repository setup options
   - Logging preferences

2. **GuiSettings**: GUI-specific settings
   - Active tab state
   - Window position and size
   - Lock states

See `settings-schema.json` for complete documentation of all fields.

## Development

### Running Tests

```bash
# Test core library
cargo test --package repobee-core

# Test all packages
cargo test --all

# Run integration test
./test_settings.sh
```

### Building

```bash
# Development build
cargo build

# Release build
cargo build --release

# Build Tauri app
pnpm tauri build
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/)
- Extensions:
  - [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
  - [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
  - [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
  - [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## License

See LICENSE file for details.

## Contributing

Contributions are welcome! Please ensure:
- All tests pass (`cargo test --all`)
- Code is formatted (`cargo fmt`)
- No clippy warnings (`cargo clippy`)
- Regenerate schema if settings change
