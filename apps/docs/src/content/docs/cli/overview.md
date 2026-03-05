---
title: CLI Overview
description: Command surface for the TypeScript CLI (`redu`)
---

The CLI is implemented in `apps/cli` and delegates all business logic to shared workflows.

## Top-level command

```bash
redu [--profile <name>] <command>
```

## Command groups

- `profile`: `list`, `active`, `show`, `load`
- `roster`: `show`
- `lms`: `verify`, `import-students`, `import-groups`, `cache list|fetch|refresh|delete`
- `git`: `verify`
- `repo`: `create`, `clone`, `delete`
- `validate`

## Build and run

```bash
pnpm cli:build
node apps/cli/dist/index.js --help
```
