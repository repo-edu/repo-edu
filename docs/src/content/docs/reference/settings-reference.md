---
title: Settings Reference
---

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

Roster data is stored separately from profile settings. The roster uses a reference-based model
where groups are top-level entities and group sets/assignments reference them by ID.

```json
{
  "connection": {
    "kind": "canvas",
    "course_id": "12345",
    "last_updated": "2025-01-07T10:00:00Z"
  },
  "students": [
    {
      "id": "abc123",
      "name": "Alice Doe",
      "email": "alice@uni.edu",
      "student_number": "1234567",
      "git_username": "alicedoe",
      "git_username_status": "valid",
      "status": "active",
      "lms_user_id": "u123",
      "enrollment_type": "student",
      "source": "lms"
    }
  ],
  "staff": [
    {
      "id": "def456",
      "name": "Prof. Smith",
      "email": "smith@uni.edu",
      "enrollment_type": "teacher",
      "source": "lms"
    }
  ],
  "groups": [
    {
      "id": "g1",
      "name": "team-alpha",
      "member_ids": ["abc123", "abc456"],
      "origin": "lms",
      "lms_group_id": "1001"
    }
  ],
  "group_sets": [
    {
      "id": "gs1",
      "name": "Project Teams",
      "group_ids": ["g1", "g2"],
      "connection": {
        "kind": "canvas",
        "course_id": "12345",
        "group_set_id": "500",
        "last_updated": "2025-01-07T10:00:00Z"
      }
    }
  ],
  "assignments": [
    {
      "id": "a1",
      "name": "task-1",
      "group_set_id": "gs1",
      "group_selection": {
        "kind": "all",
        "excluded_group_ids": []
      }
    }
  ]
}
```

### RosterConnection

| Kind | Fields | Description |
|------|--------|-------------|
| `canvas` | `course_id`, `last_updated` | Imported from Canvas LMS |
| `moodle` | `course_id`, `last_updated` | Imported from Moodle LMS |
| `import` | `source_filename`, `last_updated` | Imported from file |

### RosterMember (Student or Staff)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID |
| `name` | string | Full name |
| `email` | string | Email address |
| `student_number` | string \| null | Institutional student ID |
| `git_username` | string \| null | Git platform username |
| `git_username_status` | `"unknown"` \| `"valid"` \| `"invalid"` | Verification status |
| `status` | `"active"` \| `"incomplete"` \| `"dropped"` | Membership status |
| `lms_user_id` | string \| null | LMS user ID |
| `enrollment_type` | EnrollmentType | Role in the course |
| `enrollment_display` | string \| null | LMS-native status label |
| `department` | string \| null | Department (Moodle only) |
| `institution` | string \| null | Institution (Moodle only) |
| `source` | `"lms"` \| `"local"` | Origin of the member |

#### EnrollmentType

| Value | Description |
|-------|-------------|
| `"student"` | Enrolled student |
| `"teacher"` | Instructor/teacher |
| `"ta"` | Teaching assistant |
| `"designer"` | Course designer |
| `"observer"` | Observer/auditor |
| `"other"` | Other role |

Members in the `students` array always have `enrollment_type: "student"`. Members in the `staff`
array have non-student enrollment types.

### Group

Groups are top-level entities. Their `origin` field determines editability.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID |
| `name` | string | Group name |
| `member_ids` | string[] | UUIDs of roster members in this group |
| `origin` | `"system"` \| `"lms"` \| `"local"` | Determines editability |
| `lms_group_id` | string \| null | LMS group ID (required when `origin` is `lms`) |

### GroupSet

Group sets are named collections of group references with connection metadata.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID |
| `name` | string | Group set name |
| `group_ids` | string[] | UUIDs of groups in this set |
| `connection` | GroupSetConnection \| null | Source metadata |

#### GroupSetConnection

| Kind | Fields | Description |
|------|--------|-------------|
| `system` | `system_type` | Auto-managed (`individual_students` or `staff`) |
| `canvas` | `course_id`, `group_set_id`, `last_updated` | Synced from Canvas |
| `moodle` | `course_id`, `grouping_id`, `last_updated` | Synced from Moodle |
| `import` | `source_filename`, `last_updated` | Imported from CSV |

A `null` connection means the group set was created locally by the user.

### Assignment

Assignments reference a group set and define which groups to include.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal assignment ID |
| `name` | string | Assignment name (used in repo naming) |
| `description` | string \| null | Optional description |
| `group_set_id` | string | UUID of the group set this assignment uses |
| `group_selection` | GroupSelectionMode | How to select groups from the set |

#### GroupSelectionMode

| Kind | Fields | Description |
|------|--------|-------------|
| `all` | `excluded_group_ids` | All groups in the set, minus exclusions |
| `pattern` | `pattern`, `excluded_group_ids` | Glob match on group names, minus exclusions |

The `pattern` field supports simple glob syntax: `*` (any chars), `?` (single char),
`[abc]` (character class), `[!abc]` (negated class), `\` (escape).
