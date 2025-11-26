# repo-edu

A monorepo containing tools for educational repository management, designed to streamline the workflow of managing student repositories and integrating with Learning Management Systems (LMS).

## Structure

```
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

## Configuration

Settings are stored in `~/.config/repo-manage/settings.json` (or equivalent on Windows/macOS). The application provides a GUI for managing all configuration options.

## License

MIT
