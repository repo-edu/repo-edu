# repo-edu

A monorepo containing tools for educational repository management, designed to streamline the
workflow of managing student repositories and integrating with Learning Management Systems (LMS).

## Structure

```text
repo-edu/
├── apps/
│   └── repo-manage/          # Tauri desktop app
│       ├── src/              # React frontend
│       ├── src-tauri/        # Rust backend
│       ├── repo-manage-core/ # Core library
│       └── repo-manage-cli/  # CLI tool
└── packages/
    └── ui/                   # Shared UI components
```

## Features

### LMS Import Tab

- **Course Verification**: Validate LMS credentials and verify course access
- **Student Roster Export**: Fetch students and group assignments from Canvas/Moodle
- **Multiple Output Formats**: Export to YAML (RepoBee format), CSV, and XLSX
- **Progress Tracking**: Real-time progress updates during data fetching

### Repository Setup Tab

- **Git Platform Support**: Works with GitHub, GitLab, and Gitea
- **Repository Creation**: Batch create student repositories from templates
- **Repository Cloning**: Clone all student repos with configurable directory layouts
- **Configuration Verification**: Validate platform credentials before operations

## Tech Stack

### Frontend

- **React** with TypeScript
- **Zustand** for state management
- **shadcn/ui** components (via `@repo-edu/ui`)
- **Vite** for bundling

### Backend

- **Tauri** (Rust) for native desktop capabilities
- **lms-api** for Canvas/Moodle integration
- **git2** for Git operations

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Rust (for Tauri development)

### Installation

```bash
# Clone the repository
git clone https://github.com/repo-edu/repo-edu.git
cd repo-edu

# Install dependencies
pnpm install

# Run the desktop app in development mode
cd apps/repo-manage
pnpm tauri dev
```

### Building

```bash
cd apps/repo-manage
pnpm tauri build
```

## Documentation

Full documentation is available at [repo-edu.github.io/repo-edu](https://repo-edu.github.io/repo-edu/).

To preview documentation locally:

```bash
pnpm docs:dev
```

## Configuration

Settings are stored in `~/.config/repo-manage/settings.json` (or equivalent on Windows/macOS). The
application provides a GUI for managing all configuration options.

## Dependency Management

This monorepo uses [pnpm Catalogs](https://pnpm.io/catalogs) to ensure consistent dependency
versions across all packages.

### How it works

Shared dependency versions are defined once in `pnpm-workspace.yaml`:

```yaml
catalog:
  react: 19.2.1
  react-dom: 19.2.1
  "@types/react": 19.2.7
  "@types/react-dom": 19.2.3
  typescript: 5.9.3
```

Package.json files reference these with `catalog:` instead of version numbers:

```json
{
  "dependencies": {
    "react": "catalog:",
    "react-dom": "catalog:"
  }
}
```

### Updating shared dependencies

To update a shared dependency (e.g., React):

1. Edit the version in `pnpm-workspace.yaml`
2. Run `pnpm install`

All packages will automatically use the new version.

### Adding new shared dependencies

1. Add the dependency and version to `catalog:` in `pnpm-workspace.yaml`
2. Use `"package-name": "catalog:"` in package.json files that need it

### Why this matters

Without catalogs, different packages can end up with different versions of the same dependency. For
React, this causes runtime errors like "Invalid hook call" because React requires exactly one
instance in the app.

## License

MIT
