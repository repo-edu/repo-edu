---
title: Quick Start
description: Verify desktop, CLI, and docs surfaces in one pass
---

After [installing](/repo-edu/getting-started/installation/), run through these steps to verify everything works.

## 1. Build the project

```bash
pnpm build
```

This compiles all workspace packages and apps.

## 2. Launch the desktop app

```bash
pnpm dev
```

A desktop window should open showing the repo-edu interface. If it doesn't, check the terminal output for errors — see [Troubleshooting](/repo-edu/reference/troubleshooting/) for common issues.

## 3. Try the CLI

```bash
pnpm cli:build
redu course list
redu repo update --help
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
pnpm check
```

This runs linting, type checking, and all tests across the workspace. Use this before committing changes to catch issues early.
