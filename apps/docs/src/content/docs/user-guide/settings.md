---
title: Settings and Profiles
description: Connection settings, profile selection, and persistence behavior
---

## Data model split

- App settings store global connections and appearance preferences.
- Profiles store course-specific roster, groups, assignments, and repo template data.

## CLI profile commands

```bash
node apps/cli/dist/index.js profile list
node apps/cli/dist/index.js profile active
node apps/cli/dist/index.js profile show --profile <profile-id>
node apps/cli/dist/index.js profile load <profile-id>
```

## Storage locations

- CLI: `~/.repo-edu` by default (`REPO_EDU_CLI_DATA_DIR` overrides)
- Desktop: Electron `app.getPath("userData")`

## Validation behavior

Both settings and profiles are validated via `@repo-edu/domain` schemas on load and save.
