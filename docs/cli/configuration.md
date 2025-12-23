# CLI Configuration

The CLI uses the same configuration system as the GUI application, with additional support for
environment variable overrides.

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
├── settings.json           # App settings (active profile, theme)
└── profiles/
    ├── default.json        # Default profile
    └── my-course.json      # Custom profiles
```

## Environment Variables

Override Git platform settings via environment variables:

| Variable | Description | Overrides |
|----------|-------------|-----------|
| `REPOBEE_BASE_URL` | Git platform URL | `git.*.base_url` |
| `REPOBEE_TOKEN` | Access token | `git.*.access_token` |
| `REPOBEE_ORG` | Student repos org/group | `git.*.student_repos_*` |
| `REPOBEE_USER` | Platform username | `git.*.user` |
| `REPOBEE_TEMPLATE_ORG` | Template org/group | `git.*.template_*` |

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
          REPOBEE_BASE_URL: https://gitlab.tue.nl
          REPOBEE_ORG: cs101-repos
          REPOBEE_TEMPLATE_ORG: cs101-templates
        run: |
          redu repo setup \
            --platform gitlab \
            --template ${{ inputs.template }} \
            --teams-file students.yaml
```

## Profile JSON Schema

Profile files follow this structure:

```json
{
  "git": {
    "type": "GitLab",
    "github": {
      "access_token": "",
      "user": "",
      "student_repos_org": "",
      "template_org": ""
    },
    "gitlab": {
      "access_token": "glpat-xxx",
      "base_url": "https://gitlab.tue.nl",
      "user": "instructor",
      "student_repos_group": "cs101-repos",
      "template_group": "cs101-templates"
    },
    "gitea": {
      "access_token": "",
      "base_url": "",
      "user": "",
      "student_repos_group": "",
      "template_group": ""
    }
  },
  "lms": {
    "type": "Canvas",
    "canvas": {
      "access_token": "xxx",
      "base_url": "https://canvas.tue.nl",
      "courses": [{ "id": "12345", "name": "CS101" }],
      "custom_url": "",
      "url_option": "TUE"
    },
    "moodle": {
      "access_token": "",
      "base_url": "",
      "courses": []
    },
    "output_folder": "./output",
    "output_yaml": true,
    "output_csv": false,
    "output_xlsx": false,
    "yaml_file": "students.yaml",
    "csv_file": "student-info.csv",
    "xlsx_file": "student-info.xlsx",
    "member_option": "EmailAndGitId",
    "include_group": true,
    "include_member": true,
    "include_initials": false,
    "full_groups": true
  },
  "repo": {
    "assignments": "task-1,task-2",
    "directory_layout": "Flat",
    "target_folder": "./repos",
    "yaml_file": "students.yaml"
  }
}
```

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
