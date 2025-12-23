# repo-edu

> ⚠️ **Pre-alpha**: This project is under active development and not yet ready for production use. APIs and features may change without notice.

Tools for educational repository management — streamline student repository workflows with LMS
integration.

## Features

- **LMS Import**: Fetch student rosters and groups from Canvas or Moodle. Export to YAML, CSV, or
  XLSX.
- **Repository Setup**: Batch create student repositories from templates on GitHub, GitLab, or
  Gitea.
- **Cross-Platform**: Native desktop app (macOS, Windows, Linux) and CLI for automation.

## Quick Start

```bash
# Clone and install
git clone https://github.com/repo-edu/repo-edu.git
cd repo-edu
pnpm install

# Run desktop app
pnpm tauri:dev

# Or build CLI
pnpm cli:build
```

## Documentation

Full documentation: [repo-edu.github.io/repo-edu](https://repo-edu.github.io/repo-edu/)

- [Installation](https://repo-edu.github.io/repo-edu/getting-started/installation)
- [Quick Start Guide](https://repo-edu.github.io/repo-edu/getting-started/quick-start)
- [CLI Reference](https://repo-edu.github.io/repo-edu/cli/overview)
- [Contributing](https://repo-edu.github.io/repo-edu/development/contributing)

Preview docs locally: `pnpm docs:dev`

## Project Structure

```text
repo-edu/
├── apps/repo-manage/     # Tauri app, CLI, and core library
├── crates/               # LMS client crates
├── packages/ui/          # Shared UI components
└── docs/                 # VitePress documentation
```

## Acknowledgments

- **Repository Setup** is based on [RepoBee](https://github.com/repobee/repobee) by **Simon
  Larsén**.
- **LMS Import** originated from a RepoBee extension by **Huub de Beer**.
- **Jingjing Wang** developed the first Python GUI applications.
- **Bert van Beek** redesigned and integrated both into the current Tauri application, adding Moodle
  support, profile management, and native platform implementations.

## License

MIT
