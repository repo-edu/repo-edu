---
title: Output Formats
description: File formats used by import and export workflows
---

repo-edu supports several file formats for importing and exporting roster, group, and configuration data.

## Supported formats

| Format | Extension | Import | Export | Used by |
|--------|-----------|--------|--------|---------|
| CSV | `.csv` | Yes | Yes | Roster import/export, group set import/export, Git username import |
| TXT | `.txt` | Yes | Yes | RepoBee students group-set import/export |
| XLSX | `.xlsx` | No | No | Unsupported |
| JSON | `.json` | — | — | Persisted settings and course files (internal) |

Format support is validated at the workflow level — requesting an unsupported format produces a validation error.

## CSV formats

### Roster export

Exported by the `roster.exportMembers` workflow. One row per member (students and staff combined).

| Column | Description |
|--------|-------------|
| `name` | Display name |
| `email` | Email address |
| `student_number` | Institution student number |
| `git_username` | Git provider username |
| `status` | `active`, `incomplete`, or `dropped` |
| `enrollment_type` | `student`, `teacher`, `ta`, `designer`, `observer`, `other` |

### Roster import

Imported by the `roster.importFromFile` workflow. Internal IDs are never imported from CSV.

- Existing members are matched by normalized `email` (primary) or `student_number` (fallback).
- Unmatched rows create new members with allocator-generated local IDs (`m_...`).

### Group set export

Exported by the `groupSet.export` workflow.

- Named group sets export as CSV (one row per member per group).
- Unnamed group sets export as RepoBee `students.txt` (`.txt`).

| Column | Description |
|--------|-------------|
| `group_name` | Group display name |
| `name` | Member display name |
| `email` | Member email |

### Group set import

Imported by the `groupSet.previewImportFromFile` / `groupSet.importFromFile` workflows.

| Column | Required | Description |
|--------|----------|-------------|
| `group_name` | Yes | Group display name |
| `name` | No | Member name (for preview display) |
| `email` | No | Member email (matched against roster) |

Notes:

- CSV import semantics are additive/update-only: existing groups not mentioned in the file are untouched.
- Group matching uses normalized `group_name` (trim + collapse whitespace + lowercase).
- Empty-group rows (`group_name` with blank `name` and `email`) create/keep empty groups.

Members are matched to the existing roster by email. Missing members are reported in preview.

### RepoBee students import (`.txt`)

RepoBee students files are plain text: one team per line, usernames separated by whitespace.

```text
slarse glassey
glennol
```

- Import format: `repobee-students`
- Semantics: full replace of the target imported group set
- Reconciliation: usernames are normalized and stored directly in unnamed `UsernameTeam.gitUsernames` (no roster member creation)

### Git username import

Imported by the `gitUsernames.import` workflow. Maps email addresses to Git provider usernames.

| Column | Required | Description |
|--------|----------|-------------|
| `email` | Yes | Member email (must match a roster member) |
| `git_username` | Yes | Git provider username |

After import, if a Git connection is configured, the workflow verifies each username against the Git provider and sets the status to `valid`, `invalid`, or `unknown`.

## XLSX format

XLSX is currently unsupported for import and export workflows.
