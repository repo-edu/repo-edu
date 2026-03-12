---
title: Settings and Courses
description: Connection settings, course selection, and persistence behavior
---

## Data model split

- App settings store global connections and appearance preferences.
- Courses store course-specific roster, groups, assignments, and repo template data.

## CLI course commands

```bash
node apps/cli/dist/index.js course list
node apps/cli/dist/index.js course active
node apps/cli/dist/index.js course show --course <course-id>
node apps/cli/dist/index.js course load <course-id>
```

## Storage locations

- CLI: `~/.repo-edu` by default (`REPO_EDU_CLI_DATA_DIR` overrides)
- Desktop: Electron `app.getPath("userData")`

## Validation behavior

Both settings and courses are validated via `@repo-edu/domain` schemas on load and save.
