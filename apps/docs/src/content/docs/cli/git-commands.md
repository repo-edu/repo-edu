---
title: Git Commands
description: Verify Git provider connections from the command line
---

## `redu git verify`

Tests whether the active course's Git connection is working. The command makes a test API call to the configured Git provider (GitHub, GitLab, or Gitea) and reports the result.

```bash
redu git verify --course seed-course
```

```text
Git connection 'GitHub Org' verified=true checkedAt=2026-03-05T12:00:00Z
```

If verification fails (invalid token, unreachable server, insufficient permissions), the command exits with code 1 and prints the error.

### When to use

Run `git verify` before repository operations (`repo create`, `repo clone`, `repo update`) to confirm your personal access token is valid and has the required permissions for the target organization. This avoids partial failures mid-way through a batch repository creation.
