# CLI Configuration

The CLI uses the same configuration system as the GUI application, with additional support for
environment variable overrides.

::: warning CLI Commands Disabled
LMS and Repo commands are temporarily disabled during the roster refactor. Only Profile commands
are currently functional.
:::

## Configuration Priority

Settings are resolved in this order (highest priority first):

1. Command-line arguments (`--platform`, `--output`, etc.)
2. Environment variables (`REPOBEE_TOKEN`, etc.)
3. Active profile settings
4. Default values

## Configuration Directory

Settings are stored in a platform-specific directory:

| Platform | Location |
|----------|----------|
| macOS | `~/Library/Application Support/repo-edu/` |
| Windows | `%APPDATA%\repo-edu\` |
| Linux | `~/.config/repo-edu/` |

### Directory Structure

```text
repo-edu/
├── app.json                # App settings (theme, connections)
├── profiles/
│   ├── default.json        # Default profile
│   └── my-course.json      # Custom profiles
└── rosters/
    ├── default.json        # Roster data for profiles
    └── my-course.json
```

## Environment Variables

Override Git platform settings via environment variables:

| Variable | Description |
|----------|-------------|
| `REPOBEE_BASE_URL` | Git platform URL |
| `REPOBEE_TOKEN` | Access token |
| `REPOBEE_ORG` | Student repos org/group |
| `REPOBEE_USER` | Platform username |
| `REPOBEE_TEMPLATE_ORG` | Template org/group |
| `REPOBEE_CONFIG_DIR` | Override config directory |

### Example: CI/CD Pipeline

```yaml
# .github/workflows/setup-repos.yml
name: Setup Student Repos
on:
  workflow_dispatch:
    inputs:
      template:
        description: 'Template repository name'
        required: true

jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup repos
        env:
          REPOBEE_TOKEN: ${{ secrets.GITLAB_TOKEN }}
          REPOBEE_BASE_URL: https://gitlab.example.com
          REPOBEE_ORG: cs101-repos
          REPOBEE_TEMPLATE_ORG: cs101-templates
        run: |
          redu repo setup \
            --platform gitlab \
            --template ${{ inputs.template }} \
            --teams-file students.yaml
```

::: warning
The `redu repo setup` command is currently disabled. This example shows the planned usage when
re-enabled.
:::

## Configuration Files

### App Settings (`app.json`)

App-level settings shared across all profiles:

```json
{
  "theme": "system",
  "date_format": "iso",
  "time_format": "24h",
  "lms_connection": {
    "lms_type": "Canvas",
    "base_url": "https://canvas.example.com",
    "access_token": "..."
  },
  "git_connections": {
    "gitlab-main": {
      "server_type": "GitLab",
      "connection": {
        "access_token": "glpat-xxx",
        "base_url": "https://gitlab.example.com",
        "user": "instructor"
      }
    }
  }
}
```

### Profile Settings (`profiles/*.json`)

Per-profile configuration:

```json
{
  "course": {
    "id": "12345",
    "name": "CS101 Introduction to Programming"
  },
  "git_connection": "gitlab-main",
  "operations": {
    "target_org": "cs101-students-2025",
    "repo_name_template": "{group}-{assignment}",
    "create": {
      "template_org": "cs101-templates"
    },
    "clone": {
      "target_dir": "./repos",
      "directory_layout": "ByTeam"
    },
    "delete": {}
  },
  "exports": {
    "output_folder": "./output",
    "output_yaml": true,
    "output_csv": false,
    "output_xlsx": false,
    "yaml_file": "students.yaml",
    "csv_file": "students.csv",
    "xlsx_file": "students.xlsx",
    "member_option": "EmailAndGitId",
    "include_group": true,
    "include_member": true,
    "include_initials": false,
    "full_groups": true
  }
}
```

See [Settings Reference](../reference/settings-reference.md) for complete field documentation.

## Debugging Configuration

View the current configuration with:

```bash
redu profile show
```

To see where settings are being loaded from:

```bash
# Show config directory location
redu profile show | grep "Settings Directory"
```

## Tips

- Use profiles for different courses/semesters
- Use environment variables in CI/CD (never commit tokens)
- The GUI and CLI share configuration; changes sync automatically
- Create a `sandbox` profile for testing without affecting production configs
