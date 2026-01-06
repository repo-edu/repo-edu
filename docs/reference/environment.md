# Environment Variables

The `redu` CLI supports environment variables for configuration, useful for CI/CD pipelines and
scripting.

## Git Platform Variables

| Variable | Description |
|----------|-------------|
| `REPOBEE_BASE_URL` | Git platform base URL |
| `REPOBEE_TOKEN` | Access token |
| `REPOBEE_ORG` | Student repos organization/group |
| `REPOBEE_USER` | Platform username |
| `REPOBEE_TEMPLATE_ORG` | Template organization/group |

## Priority Order

Configuration is resolved in this order (highest to lowest priority):

1. Command-line flags
2. Environment variables
3. Active profile settings
4. Default values

## Examples

### GitHub Actions

```yaml
name: Create Student Repos
on: workflow_dispatch

jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install redu
        run: cargo install --path apps/repo-manage/repo-manage-cli

      - name: Create repositories
        env:
          REPOBEE_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPOBEE_ORG: cs101-students
          REPOBEE_TEMPLATE_ORG: cs101-templates
          REPOBEE_USER: instructor
        run: |
          redu repo setup --platform github --template task-1 --teams-file teams.yaml
```

### Shell Script

```bash
#!/bin/bash

# Set environment variables
export REPOBEE_TOKEN="glpat-xxxxxxxxxxxx"
export REPOBEE_ORG="course-repos"
export REPOBEE_TEMPLATE_ORG="course-templates"
export REPOBEE_USER="instructor"
export REPOBEE_BASE_URL="https://gitlab.university.edu"

# Run commands without specifying credentials
redu repo verify --platform gitlab
redu repo setup --platform gitlab --template assignment-1 --teams-file students.yaml
```

### Docker

```dockerfile
FROM rust:latest

# Install redu
RUN cargo install redu

# Set default environment
ENV REPOBEE_BASE_URL="https://gitlab.example.com"

# Run with secrets mounted at runtime
CMD ["redu", "repo", "verify"]
```

```bash
docker run -e REPOBEE_TOKEN="$GITLAB_TOKEN" \
           -e REPOBEE_ORG="students" \
           myimage redu repo setup --template task-1
```

## Security Best Practices

::: danger Never Commit Tokens
Never hardcode tokens in scripts or configuration files that are committed to version control.
:::

**Recommended approaches:**

1. **GitHub Actions**: Use repository secrets
2. **GitLab CI**: Use CI/CD variables (masked)
3. **Local development**: Use a `.env` file (gitignored)
4. **Production**: Use a secrets manager

### Using .env Files

Create a `.env` file (add to `.gitignore`):

```bash
# .env
REPOBEE_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
REPOBEE_ORG=my-course-repos
REPOBEE_USER=instructor
```

Source before running commands:

```bash
source .env
redu repo verify
```

Or use a tool like `direnv` for automatic loading.

## See Also

- [CLI Configuration](../cli/configuration.md) — Full configuration options
- [CLI Repo Commands](../cli/repo-commands.md) — Repository command reference
