---
title: Quick Start
description: Verify desktop, CLI, and docs surfaces in one pass
---

After [installing](/repo-edu/getting-started/installation/), run through these steps to verify everything works.

## 1. Validate the workspace

```bash
pnpm check
```

This runs formatting fixes, type checks, declaration builds, fixture checks, and architecture checks.

## 2. Launch the desktop app

```bash
pnpm dev
```

A desktop window should open showing the repo-edu interface. If it doesn't, check the terminal output for errors — see [Troubleshooting](/repo-edu/reference/troubleshooting/) for common issues.

## 3. Try the CLI

```bash
pnpm build:cli
./apps/cli/dist/redu course list
./apps/cli/dist/redu repo update --help
```

The first command builds the CLI. The second lists available courses (empty if this is a fresh installation). The third shows the help for the `repo update` command.

## 4. Build and test the docs site

```bash
pnpm docs:build
pnpm docs:test
```

The docs site includes an embedded demo that runs the real application against mock data in the browser. The build and test commands verify that the demo works correctly.

## 5. Run full validation

```bash
pnpm validate
```

This runs `pnpm check`, all package tests, and desktop runtime validation.
