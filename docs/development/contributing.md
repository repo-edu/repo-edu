# Contributing

Guidelines for contributing to repo-edu.

## Development Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Frontend tooling |
| pnpm | 9+ | Package manager |
| Rust | stable | Backend development |

### Platform Dependencies

**macOS:**

```bash
xcode-select --install
```

**Linux (Ubuntu/Debian):**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

**Windows:**

- Visual Studio Build Tools
- WebView2 Runtime

### Getting Started

```bash
# Clone the repository
git clone https://github.com/dvbeek/repo-edu.git
cd repo-edu

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri:dev
```

## Project Structure

```text
repo-edu/
├── apps/repo-manage/     # Main application
│   ├── src/              # React frontend
│   ├── src-tauri/        # Rust backend
│   ├── repo-manage-core/ # Shared Rust library
│   └── repo-manage-cli/  # CLI tool
├── crates/               # LMS crates
├── packages/ui/          # Shared UI components
└── docs/                 # VitePress documentation
```

## Code Style

### TypeScript/React

- Functional components with hooks
- Zustand for state management
- Biome for linting and formatting

```bash
# Format and lint
pnpm fmt
pnpm check
```

### Rust

- Standard Rust formatting
- thiserror for error types
- async/await with tokio

```bash
# Format and lint
cargo fmt
cargo clippy
```

## Workflow

### Making Changes

1. Create a feature branch
2. Make your changes
3. Run validation:

   ```bash
   pnpm validate  # check + typecheck + test
   ```

4. Commit with descriptive message
5. Push and open a pull request

### Type Bindings

After changing Rust types used in Tauri commands:

```bash
pnpm gen:bindings
```

This regenerates `apps/repo-manage/src/bindings.ts`.

## Testing

### Frontend Tests

```bash
pnpm test:ts        # Run vitest
pnpm test:ts:watch  # Watch mode
```

### Rust Tests

```bash
pnpm test:rs        # Run cargo test
cargo test -p repo-manage-core  # Single crate
```

### All Tests

```bash
pnpm test
```

## Documentation

### Local Preview

```bash
pnpm docs:dev
```

Opens at `http://localhost:5173/repo-edu/`

### Writing Documentation

- Add pages to `docs/`
- Update `docs/.vitepress/config.ts` for navigation
- Use VitePress [markdown extensions](https://vitepress.dev/guide/markdown)

### Generating API Docs

```bash
cargo doc --workspace --no-deps --open
```

## Commit Messages

Use conventional commit prefixes:

| Prefix | Use For |
|--------|---------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `docs:` | Documentation |
| `refactor:` | Code restructuring |
| `test:` | Test additions |
| `chore:` | Maintenance tasks |

Examples:

```text
feat: add Moodle group import
fix: handle empty course list gracefully
docs: update CLI installation instructions
refactor: extract platform verification logic
```

## Pull Requests

### Before Submitting

- [ ] Tests pass (`pnpm validate`)
- [ ] Code is formatted (`pnpm fmt`)
- [ ] Bindings regenerated if needed (`pnpm gen:bindings`)
- [ ] Documentation updated if needed

### PR Description

Include:

- What the change does
- Why it's needed
- How to test it
- Screenshots (for UI changes)

## Dependency Management

### pnpm Catalogs

Shared dependency versions are defined in `pnpm-workspace.yaml`:

```yaml
catalog:
  react: 19.2.1
  typescript: 5.9.3
```

Reference in package.json:

```json
{
  "dependencies": {
    "react": "catalog:"
  }
}
```

### Updating Dependencies

```bash
# Check for updates
pnpm outdated

# Update in pnpm-workspace.yaml, then:
pnpm install
```

## Getting Help

- [GitHub Issues](https://github.com/dvbeek/repo-edu/issues) — Bug reports and feature requests
- [Architecture](/development/architecture) — System overview
- [Crates](/development/crates) — Rust crate documentation
