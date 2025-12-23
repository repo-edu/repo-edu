# Settings Reference

Complete reference for all configuration options.

## Profile Structure

Each profile contains three main sections:

```json
{
  "git": { /* Git platform settings */ },
  "lms": { /* LMS connection and output settings */ },
  "repo": { /* Repository setup settings */ }
}
```

## Git Settings

### Server Type

```json
{
  "git": {
    "type": "GitLab"  // "GitHub" | "GitLab" | "Gitea"
  }
}
```

### GitHub Configuration

```json
{
  "git": {
    "github": {
      "access_token": "ghp_xxxx",
      "user": "instructor",
      "student_repos_org": "cs101-students",
      "template_org": "cs101-templates"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | GitHub personal access token |
| `user` | string | Your GitHub username |
| `student_repos_org` | string | Organization for student repositories |
| `template_org` | string | Organization containing templates |

### GitLab Configuration

```json
{
  "git": {
    "gitlab": {
      "access_token": "glpat-xxxx",
      "base_url": "https://gitlab.tue.nl",
      "user": "instructor",
      "student_repos_group": "cs101-students",
      "template_group": "cs101-templates"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | GitLab personal access token |
| `base_url` | string | GitLab instance URL |
| `user` | string | Your GitLab username |
| `student_repos_group` | string | Group/namespace for student repos |
| `template_group` | string | Group containing templates |

### Gitea Configuration

```json
{
  "git": {
    "gitea": {
      "access_token": "xxxx",
      "base_url": "https://gitea.example.com",
      "user": "instructor",
      "student_repos_group": "cs101-students",
      "template_group": "cs101-templates"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | Gitea personal access token |
| `base_url` | string | Gitea instance URL |
| `user` | string | Your Gitea username |
| `student_repos_group` | string | Organization for student repos |
| `template_group` | string | Organization with templates |

## LMS Settings

### Type Selection

```json
{
  "lms": {
    "type": "Canvas"  // "Canvas" | "Moodle"
  }
}
```

### Canvas Configuration

```json
{
  "lms": {
    "canvas": {
      "access_token": "xxxx",
      "base_url": "https://canvas.tue.nl",
      "custom_url": "",
      "url_option": "TUE",
      "courses": [
        { "id": "12345", "name": "CS101 Fall 2025" }
      ]
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | Canvas API token |
| `base_url` | string | Default Canvas URL (for TUE option) |
| `custom_url` | string | Custom Canvas URL |
| `url_option` | `"TUE"` \| `"CUSTOM"` | URL preset selection |
| `courses` | array | List of course entries |

### Moodle Configuration

```json
{
  "lms": {
    "moodle": {
      "access_token": "xxxx",
      "base_url": "https://moodle.example.com",
      "courses": [
        { "id": "67890", "name": "CS201" }
      ]
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | Moodle web service token |
| `base_url` | string | Moodle instance URL |
| `courses` | array | List of course entries |

### Output Settings

```json
{
  "lms": {
    "output_folder": "/Users/you/courses/cs101",
    "output_yaml": true,
    "output_csv": false,
    "output_xlsx": false,
    "yaml_file": "students.yaml",
    "csv_file": "student-info.csv",
    "xlsx_file": "student-info.xlsx"
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `output_folder` | string | `""` | Output directory path |
| `output_yaml` | boolean | `true` | Generate YAML file |
| `output_csv` | boolean | `false` | Generate CSV file |
| `output_xlsx` | boolean | `false` | Generate XLSX file |
| `yaml_file` | string | `"students.yaml"` | YAML filename |
| `csv_file` | string | `"student-info.csv"` | CSV filename |
| `xlsx_file` | string | `"student-info.xlsx"` | XLSX filename |

### Member Options

```json
{
  "lms": {
    "member_option": "EmailAndGitId",
    "include_group": true,
    "include_member": true,
    "include_initials": false,
    "full_groups": true
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `member_option` | enum | `"EmailAndGitId"` | Member identifier format |
| `include_group` | boolean | `true` | Include group name in output |
| `include_member` | boolean | `true` | Include member identifier |
| `include_initials` | boolean | `false` | Add initials to member ID |
| `full_groups` | boolean | `true` | Include all group members |

**Member Option Values:**

- `"EmailOnly"` — Use email address
- `"EmailAndGitId"` — Use email or extracted Git ID
- `"GitIdOnly"` — Use only extracted Git ID

## Repository Settings

```json
{
  "repo": {
    "assignments": "task-1,task-2,task-3",
    "directory_layout": "Flat",
    "target_folder": "./repos",
    "yaml_file": "students.yaml"
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `assignments` | string | `""` | Comma-separated template names |
| `directory_layout` | enum | `"Flat"` | Clone organization layout |
| `target_folder` | string | `""` | Local clone directory |
| `yaml_file` | string | `"students.yaml"` | Teams file path |

**Directory Layout Values:**

- `"Flat"` — All repos in one directory
- `"ByTeam"` — Grouped by team name
- `"ByAssignment"` — Grouped by assignment/template

## App Settings

Stored in `settings.json` (not per-profile):

```json
{
  "activeProfile": "cs101-fall-2025",
  "theme": "System",
  "activeTab": "Lms"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `activeProfile` | string | `null` | Currently active profile name |
| `theme` | enum | `"System"` | UI theme |
| `activeTab` | enum | `"Lms"` | Last active tab |

**Theme Values:** `"System"`, `"Light"`, `"Dark"`

**Active Tab Values:** `"Lms"`, `"Repo"`
