# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Purpose

`@repo-edu/docs` is the documentation site for repo-edu, built with Astro and Starlight. It
includes an interactive demo that runs the full app UI with a mock backend.

## Build & Development Commands

```bash
pnpm docs:dev    # Start dev server (from repo root)
pnpm docs:build  # Build static site (from repo root)
```

Or from this directory:

```bash
pnpm dev         # Start dev server with hot reload
pnpm build       # Build static site to dist/
pnpm preview     # Preview built site locally
```

## Architecture

### Framework

- **Astro** with **Starlight** theme for documentation
- **React** integration for interactive components
- **Tailwind CSS** for styling

### Content Structure

Documentation lives in `src/content/docs/` as Markdown (`.md`) or MDX (`.mdx`) files:

```text
src/content/docs/
├── index.mdx              # Home page
├── demo.mdx               # Interactive demo page
├── getting-started/       # Installation & quick start
├── user-guide/            # End-user documentation (LMS import, repo setup, settings)
├── cli/                   # CLI command reference (lms, git, repo, roster, validate, profile)
├── development/           # Architecture, data model, command architecture, design decisions,
│                          #   contributing, building, crates
└── reference/             # Settings reference, output formats, troubleshooting
```

Sidebar navigation is configured in `astro.config.mjs`.

### Interactive Demo

The demo page (`demo.mdx`) embeds an iframe pointing to `/demo-standalone`, which renders
`DemoApp.tsx` — the full `@repo-edu/app-core` UI backed by `@repo-edu/backend-mock`.

```typescript
// src/components/DemoApp.tsx
import { AppRoot, BackendProvider, setBackend } from "@repo-edu/app-core"
import { MockBackend } from "@repo-edu/backend-mock"
```

### Dependencies

This package depends on workspace packages:

- `@repo-edu/app-core` — Core UI components
- `@repo-edu/backend-interface` — Type definitions
- `@repo-edu/backend-mock` — Mock backend for demo
- `@repo-edu/ui` — Shared UI components
