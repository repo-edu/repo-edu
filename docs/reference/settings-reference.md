# Settings Reference

Complete reference for all configuration options.

## File Structure

repo-edu uses a two-level configuration structure:

```text
~/.config/repo-edu/
├── app.json                # App-level settings (shared across profiles)
├── profiles/
│   ├── default.json        # Default profile
│   ├── cs101-fall-2025.json
│   └── ...
└── rosters/
    ├── default.json        # Roster data for default profile
    └── ...
```

## App Settings (`app.json`)

App-level settings apply globally, independent of the active profile.

```json
{
  "theme": "system",
  "date_format": "iso",
  "time_format": "24h",
  "lms_connection": {
    "lms_type": "Canvas",
    "base_url": "https://canvas.example.com",
    "access_token": "xxxx"
  },
  "git_connections": {
    "github-main": {
      "server_type": "GitHub",
      "connection": {
        "access_token": "ghp_xxxx",
        "base_url": null,
        "user": "instructor"
      },
      "identity_mode": null
    }
  }
}
```

### Theme

| Value | Description |
|-------|-------------|
| `"system"` | Follow OS dark/light mode (default) |
| `"light"` | Always use light theme |
| `"dark"` | Always use dark theme |

### Date Format

| Value | Example |
|-------|---------|
| `"iso"` | 2025-01-07 |
| `"us"` | 01/07/2025 |
| `"eu"` | 07-01-2025 |

### Time Format

| Value | Example |
|-------|---------|
| `"24h"` | 14:30 |
| `"12h"` | 2:30 PM |

### LMS Connection

Single LMS connection shared across profiles:

| Field | Type | Description |
|-------|------|-------------|
| `lms_type` | `"Canvas"` \| `"Moodle"` | LMS platform |
| `base_url` | string | LMS instance URL |
| `access_token` | string | API access token |

### Git Connections

Named git connections that can be referenced by profiles:

```json
{
  "git_connections": {
    "github-main": { /* GitConnection */ },
    "gitlab-uni": { /* GitConnection */ }
  }
}
```

#### GitConnection

| Field | Type | Description |
|-------|------|-------------|
| `server_type` | `"GitHub"` \| `"GitLab"` \| `"Gitea"` | Platform type |
| `connection` | PlatformConnection | Credentials |
| `identity_mode` | string \| null | Git identity configuration |

#### PlatformConnection

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `access_token` | string | Yes | Personal access token |
| `base_url` | string \| null | No | Platform URL (null for GitHub) |
| `user` | string | Yes | Your username |

## Profile Settings (`profiles/*.json`)

Per-profile settings for course-specific configuration.

```json
{
  "course": {
    "id": "12345",
    "name": "CS101 Introduction to Programming"
  },
  "git_connection": "github-main",
  "operations": {
    "target_org": "cs101-students-2025",
    "repo_name_template": "{group}-{assignment}",
    "create": {
      "template_org": "cs101-templates"
    },
    "clone": {
      "target_dir": "/Users/instructor/repos/cs101",
      "directory_layout": "ByTeam"
    },
    "delete": {}
  },
  "exports": {
    "output_folder": "/Users/instructor/exports",
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

### Course Info

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | LMS course ID |
| `name` | string | Course display name |

### Git Connection Reference

| Field | Type | Description |
|-------|------|-------------|
| `git_connection` | string \| null | Name of git connection from app.json |

### Operation Configs

| Field | Type | Description |
|-------|------|-------------|
| `target_org` | string | Organization/group for student repos |
| `repo_name_template` | string | Pattern for repo names |
| `create` | CreateConfig | Repository creation settings |
| `clone` | CloneConfig | Repository clone settings |
| `delete` | DeleteConfig | Repository deletion settings |

#### CreateConfig

| Field | Type | Description |
|-------|------|-------------|
| `template_org` | string | Organization containing template repos |

#### CloneConfig

| Field | Type | Description |
|-------|------|-------------|
| `target_dir` | string | Local directory for cloned repos |
| `directory_layout` | DirectoryLayout | How to organize cloned repos |

#### DirectoryLayout

| Value | Structure | Description |
|-------|-----------|-------------|
| `"Flat"` | `repo/` | All repos in one directory |
| `"ByTeam"` | `team/repo/` | Grouped by team name |
| `"ByAssignment"` | `assignment/repo/` | Grouped by assignment |

### Export Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `output_folder` | string | `""` | Export directory path |
| `output_yaml` | boolean | `true` | Generate YAML file |
| `output_csv` | boolean | `false` | Generate CSV file |
| `output_xlsx` | boolean | `false` | Generate XLSX file |
| `yaml_file` | string | `"students.yaml"` | YAML filename |
| `csv_file` | string | `"students.csv"` | CSV filename |
| `xlsx_file` | string | `"students.xlsx"` | XLSX filename |
| `member_option` | MemberOption | `"EmailAndGitId"` | Member identifier format |
| `include_group` | boolean | `true` | Include group name in output |
| `include_member` | boolean | `true` | Include member identifier |
| `include_initials` | boolean | `false` | Add initials to member ID |
| `full_groups` | boolean | `true` | Include all group members |

#### MemberOption

| Value | Output | Description |
|-------|--------|-------------|
| `"EmailOnly"` | `alice@uni.edu` | Use full email address |
| `"EmailAndGitId"` | `alice` | Use git username or extract from email |
| `"GitIdOnly"` | `alice` | Use only git username |

## Roster Data (`rosters/*.json`)

Roster data is stored separately from profile settings:

```json
{
  "source": {
    "type": "lms",
    "lms_id": "12345",
    "imported_at": "2025-01-07T10:00:00Z"
  },
  "students": [
    {
      "id": "s1",
      "name": "Alice Doe",
      "email": "alice@uni.edu",
      "student_number": "1234567",
      "git_username": "alicedoe",
      "lms_id": "u123"
    }
  ],
  "assignments": [
    {
      "id": "a1",
      "name": "task-1",
      "groups": [
        {
          "id": "g1",
          "name": "team-alpha",
          "student_ids": ["s1", "s2"]
        }
      ]
    }
  ]
}
```

### Student

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal student ID |
| `name` | string | Full name |
| `email` | string | Email address |
| `student_number` | string \| null | Institutional student ID |
| `git_username` | string \| null | Git platform username |
| `lms_id` | string \| null | LMS user ID |

### Assignment

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal assignment ID |
| `name` | string | Assignment name (used in repo naming) |
| `groups` | Group[] | Groups for this assignment |

### Group

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal group ID |
| `name` | string | Group name |
| `student_ids` | string[] | IDs of students in group |

## Environment Variables

For CI/automation, some settings can be overridden:

| Variable | Description |
|----------|-------------|
| `REPOBEE_BASE_URL` | Git platform base URL |
| `REPOBEE_TOKEN` | Access token |
| `REPOBEE_ORG` | Student repos organization |
| `REPOBEE_USER` | Platform username |
| `REPOBEE_TEMPLATE_ORG` | Template organization |
| `REPOBEE_CONFIG_DIR` | Override config directory |
