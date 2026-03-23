---
title: CLI Overview
description: Command surface for the TypeScript CLI (`redu`)
---

The CLI is implemented in `apps/cli` and delegates all business logic to shared workflows.

## Top-level command

```bash
redu [--course <name>] <command>
```

## Command groups

- `course`: `list`, `active`, `show`, `load`
- `lms`: `verify`
- `git`: `verify`
- `repo`: `create`, `clone`, `update`
- `validate`

This is the target CLI command surface for repeatable execution paths. Setup-phase workflows (LMS imports, group set management, roster editing) are intentionally GUI-only. See [CLI-GUI Parity](/development/cli-gui-parity/) for the rationale.

## Build and run

```bash
pnpm cli:build
node apps/cli/dist/index.js --help
```
