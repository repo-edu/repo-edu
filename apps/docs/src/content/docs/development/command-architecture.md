---
title: Command Architecture
description: CLI command handlers and workflow delegation
---

## CLI layering

- `apps/cli/src/cli.ts`: command tree and global flags
- `apps/cli/src/commands/*`: argument parsing and output formatting
- `apps/cli/src/workflow-runtime.ts`: constructs workflow client from shared handlers

## Design rule

CLI handlers should remain thin:

- parse arguments
- call workflows
- render output

Business semantics must stay in shared packages (`application`, `domain`).
