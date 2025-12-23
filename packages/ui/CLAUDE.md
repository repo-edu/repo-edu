# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Package Overview

Shared shadcn/ui component library for the repo-edu monorepo. Uses the "new-york" style variant with
Tailwind CSS.

## Adding Components

Use shadcn CLI from monorepo root, targeting this package:

```bash
pnpm dlx shadcn@latest add <component> --cwd packages/ui
```

After adding, export the component from `src/index.ts`.

## Exports

- `@repo-edu/ui` — All components and utilities from `src/index.ts`
- `@repo-edu/ui/components/ui/*` — Direct component imports
- `@repo-edu/ui/components/icons` — Curated lucide-react icon re-exports
- `@repo-edu/ui/lib/*` — Utilities (`cn` helper)

## Component Patterns

- Components use `class-variance-authority` (cva) for variant management
- Export both the component and its variants (e.g., `Button` and `buttonVariants`)
- Use `data-slot` attributes for component identification
- Use relative imports within the package (`../../lib/utils`)
- Use `React.ComponentProps<"element">` for prop types

## Icons

Add icons to `src/components/icons.ts` for consistent usage across the monorepo rather than
importing lucide-react directly in consumer apps.
