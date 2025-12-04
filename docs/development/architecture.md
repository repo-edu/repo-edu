# Architecture

RepoManage is built as a Tauri desktop application with a React frontend and Rust backend.

## Project Structure

```
repo-edu/
├── apps/
│   └── repo-manage/          # Main application
│       ├── src/              # React frontend
│       ├── src-tauri/        # Tauri/Rust backend
│       ├── repo-manage-core/ # Core Rust library
│       └── repo-manage-cli/  # CLI tool
└── packages/
    └── ui/                   # Shared UI components
```

## Technology Stack

### Frontend
- **React** with TypeScript
- **Zustand** for state management
- **shadcn/ui** components (via `@repo-edu/ui`)
- **Vite** for bundling
- **Tailwind CSS** for styling

### Backend
- **Tauri** for desktop integration
- **Rust** for core logic
- **tauri-specta** for TypeScript bindings
- **git2** for Git operations
- **lms-api** for Canvas/Moodle integration

## Key Patterns

### Type Safety
TypeScript bindings are auto-generated from Rust types using tauri-specta. Run:
```bash
pnpm gen:bindings
```

### State Management
- **Zustand stores** for UI state
- **Rust backend** for persistent settings
- Settings are validated with JSON Schema

### Error Handling
Errors flow from Rust to frontend with structured messages and details.

## Data Flow

```
User Action → React Component → Zustand Store → Tauri Command → Rust Backend
                                                       ↓
User Feedback ← React Component ← Zustand Store ← Result/Error
```
