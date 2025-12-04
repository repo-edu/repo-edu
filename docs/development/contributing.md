# Contributing

Guidelines for contributing to RepoManage.

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm
- Rust (latest stable)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/repo-edu/repo-edu.git
cd repo-edu

# Install dependencies
pnpm install

# Run in development mode
cd apps/repo-manage
pnpm tauri dev
```

## Code Style

### TypeScript/React
- Use functional components with hooks
- Prefer Zustand for state management
- Follow existing patterns in the codebase

### Rust
- Run `cargo fmt` before committing
- Use `thiserror` for error types
- Follow the existing module structure

## Testing

### Frontend Tests
```bash
cd apps/repo-manage
pnpm test:run
```

### Rust Tests
```bash
cd apps/repo-manage
cargo test
```

## Documentation

Documentation is built with VitePress and deployed to GitHub Pages.

### Preview Locally

```bash
pnpm docs:dev
```

Then open the URL shown in the terminal (usually `http://localhost:5173`).

### Writing Docs

- Add pages to `docs/`
- Update `docs/.vitepress/config.ts` navigation if adding new pages
- Use VitePress [markdown extensions](https://vitepress.dev/guide/markdown) for tips, warnings, etc.

## Pull Requests

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## Commit Messages

Use clear, descriptive commit messages:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation
- `refactor:` for code changes that don't add features
- `test:` for test additions
- `chore:` for maintenance tasks
