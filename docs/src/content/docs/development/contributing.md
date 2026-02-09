---
title: Contributing
description: Guidelines for contributing to repo-edu.
---

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
git clone https://github.com/repo-edu/repo-edu.git
cd repo-edu

# Install dependencies
pnpm install

# Run in development mode
pnpm dev
```

## Project Structure

```text
repo-edu/
├── apps/repo-manage/          # Main application
│   ├── src/                   # Tauri React entrypoint (thin wrapper)
│   ├── src-tauri/             # Rust backend
│   ├── core/                  # Shared Rust library (CLI + GUI)
│   ├── cli/                   # CLI tool (redu)
│   └── schemas/               # JSON Schemas (source of truth for types)
├── crates/                    # LMS crates
├── packages/
│   ├── ui/                    # Shared shadcn/ui components
│   ├── app-core/              # Environment-agnostic core UI and state
│   ├── backend-interface/     # TypeScript contract (BackendAPI interface)
│   └── backend-mock/          # In-memory mock backend for tests/demos
└── docs/                      # Starlight documentation
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

After changing JSON Schemas:

```bash
pnpm gen:bindings
```

This regenerates five files from the schemas (see [Architecture](./architecture.md#type-safety-pipeline)
for the full list). Never edit generated files directly.

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
cd docs
pnpm dev
```

Opens at `http://localhost:4321/`

### Writing Documentation

- Add pages to `docs/src/content/docs/`
- Update `docs/astro.config.mjs` for navigation
- Use Starlight [markdown features](https://starlight.astro.build/guides/authoring-content/)

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

This monorepo uses [pnpm Catalogs](https://pnpm.io/catalogs) to ensure consistent dependency
versions across all packages.

Shared dependency versions are defined once in `pnpm-workspace.yaml`:

```yaml
catalog:
  react: 19.2.1
  react-dom: 19.2.1
  typescript: 5.9.3
```

Packages reference these with `catalog:` instead of version numbers:

```json
{
  "dependencies": {
    "react": "catalog:",
    "react-dom": "catalog:"
  }
}
```

### Updating Shared Dependencies

1. Edit the version in `pnpm-workspace.yaml`
2. Run `pnpm install`

All packages automatically use the new version.

### Adding New Shared Dependencies

1. Add the dependency and version to `catalog:` in `pnpm-workspace.yaml`
2. Use `"package-name": "catalog:"` in package.json files that need it

### Why This Matters

Without catalogs, different packages can end up with different versions of the same dependency.
For React, this causes runtime errors like "Invalid hook call" because React requires exactly one
instance in the app.

## Getting Help

- [GitHub Issues](https://github.com/repo-edu/repo-edu/issues) — Bug reports and feature requests
- [Architecture](./architecture.md) — System overview
- [Crates](./crates.md) — Rust crate documentation
