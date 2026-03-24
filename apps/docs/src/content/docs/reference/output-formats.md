---
title: Output Formats
description: File formats used by import and export workflows
---

repo-edu supports several file formats for importing and exporting roster, group, and configuration data.

## Supported formats

| Format | Extension | Import | Export | Used by |
|--------|-----------|--------|--------|---------|
| CSV | `.csv` | Yes | Yes | Roster import/export, group set import/export, Git username import |
| XLSX | `.xlsx` | No | Yes | Roster export, group set export |
| YAML | `.yaml` | No | Yes | Group set export (Repobee-compatible) |
| JSON | `.json` | — | — | Persisted settings and course files (internal) |

Format support is validated at the workflow level — requesting an unsupported format produces a validation error.

## CSV formats

### Roster export

Exported by the `roster.exportMembers` workflow. One row per member (students and staff combined).

| Column | Description |
|--------|-------------|
| `id` | Member unique identifier |
| `name` | Display name |
| `email` | Email address |
| `student_number` | Institution student number |
| `git_username` | Git provider username |
| `status` | `active`, `incomplete`, or `dropped` |
| `enrollment_type` | `student`, `teacher`, `ta`, `designer`, `observer`, `other` |

### Roster import

Imported by the `roster.importFromFile` workflow. Same columns as export, but only `name` is required — other fields are optional and will be filled with defaults.

### Group set export

Exported by the `groupSet.export` workflow. One row per member per group.

| Column | Description |
|--------|-------------|
| `group_set_id` | Group set identifier |
| `group_id` | Group identifier |
| `group_name` | Group display name |
| `name` | Member display name |
| `email` | Member email |

### Group set import

Imported by the `groupSet.previewImportFromFile` workflow. One row per member per group.

| Column | Required | Description |
|--------|----------|-------------|
| `group_name` | Yes | Group display name |
| `group_id` | No | Optional group identifier |
| `name` | No | Member name (for preview display) |
| `email` | No | Member email (matched against roster) |

Members are matched to the existing roster by email. Emails that don't match any roster member are reported as missing in the import preview.

### Git username import

Imported by the `gitUsernames.import` workflow. Maps email addresses to Git provider usernames.

| Column | Required | Description |
|--------|----------|-------------|
| `email` | Yes | Member email (must match a roster member) |
| `git_username` | Yes | Git provider username |

After import, if a Git connection is configured, the workflow verifies each username against the Git provider and sets the status to `valid`, `invalid`, or `unknown`.

## YAML format

### Group set export (Repobee-compatible)

The YAML export produces a team list compatible with [Repobee](https://repobee.readthedocs.io/), a tool for managing student repositories. This allows migration between repo-edu and Repobee workflows.

## XLSX format

XLSX export produces the same column structure as CSV. It is available for roster and group set exports but not for imports (import only accepts CSV).
