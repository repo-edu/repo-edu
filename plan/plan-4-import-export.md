# Phase 4: Import/Export I/O — COMPLETED

See [plan.md](./plan.md) for overview and [plan-0-data-model.md](./plan-0-data-model.md) for CSV format expectations.

**Prerequisites:** Complete [Phase 3: LMS Client Mapping](./plan-3-lms-client.md) (**done**)

> **Status: DONE.** All CSV import/export operations implemented in `core/src/operations/group_set.rs`. Base58 UUID transport via `bs58` crate. Roster XLSX export updated with new columns. Key implementation details:
>
> - `GroupSetImportPreview` uses `serde_json::Value` (oneOf schema → opaque type in Rust)
> - `GroupSetConnection` also uses `serde_json::Value` wrapper
> - Member matching is email-based, case-insensitive; ambiguous emails (multiple roster members sharing same email) are excluded and reported
> - Group reimport matches by `group_id` (base58-decoded UUID) first, falls back to `group_name`

## Checklist

### Roster XLSX Export

- [x] Update roster export to include all student properties (students only; staff remain excluded from roster export):
  - `student_number` (Canvas sis_user_id / Moodle idnumber)
  - `enrollment_type` (student, teacher, ta, etc.)
  - `department` (Moodle)
  - `institution` (Moodle)
  - `source` (lms / local)

### Group Set Import (CSV)

- [x] Parse file (CSV format)
- [x] Generate new UUID for GroupSet
- [x] Decode and validate base58 ID columns for `group_set_id` and `group_id` per the canonical rules in [CSV Import/Export Format § ID column handling](#csv-importexport-format)
- [x] For new import: discard decoded `group_set_id`/`group_id` values after validation
- [x] For each group in file:
  - Generate new UUID for Group with `origin: "local"` and `lms_group_id: null` (mutable)
  - Add Group to `roster.groups` (top-level)
  - Add Group ID to GroupSet's `group_ids`
- [x] Preserve group order based on first appearance in the CSV file
- [x] Set `connection: { kind: "import", source_filename, last_updated }`
- [x] Duplicate handling:
  - Treat duplicate `group_name` rows as the same group (merge members, dedupe `member_ids`)
  - Reject duplicate (`group_name`, `email`) membership rows as an error (email present)
  - Allow a single empty-email row per `group_name` to represent an empty group
- [x] Roster member matching rules (students + staff):
  - Match by email (case-insensitive, trimmed)
  - If multiple roster members share the same email, treat as ambiguous — omit from `member_ids` and report in `missing_members` with reason
  - If no email match found, report in `missing_members`
- [x] Return `GroupSetImportResult` with:
  - `mode: "import"`
  - `group_set` (new)
  - `groups_upserted` (all created groups)
  - `deleted_group_ids: []`
  - `missing_members` + `total_missing` (no roster match)
- [x] Note: Imported groups are fully mutable because `origin: "local"`

### Preview Import Group Set

- [x] Parse and validate file (same rules as import)
- [x] Build `GroupSetImportPreview` with:
  - `groups`: list of `{ name, member_count }`
  - `missing_members` + `total_missing` (no roster match)
  - `mode: "import"`
- [x] Do not generate UUIDs or mutate roster

### Re-import Group Set

- [x] Re-open file picker
- [x] Parse and validate file (reject duplicate `group_name` + `email` membership rows; allow a single empty-email row per group; reject `group_id` mapped to multiple `group_name` values)
- [x] Match existing groups by `group_id` **if present** (base58 decode -> UUID); fallback to `group_name` when `group_id` is missing
- [x] If `group_id` column exists but a row value is blank, treat it as missing and fallback to `group_name`
- [x] If CSV `group_set_id` is present, decode base58 -> UUID and compare with target set ID; mismatch is a validation error (no changes applied)
- [x] If matched: update Group in place (name, member_ids) (dedupe `member_ids`)
  - If new: create Group entity with new UUID, `origin: "local"`, and `lms_group_id: null`
- [x] For groups no longer in file:
  - Remove from GroupSet's `group_ids`
  - If orphaned: delete Group from `roster.groups`
- [x] Update `group_ids` order to match the CSV file order
- [x] Update `last_updated` timestamp
- [x] Return `GroupSetImportResult` with:
  - `mode: "reimport"`
  - `group_set` (updated)
  - `groups_upserted` (created + updated groups)
  - `deleted_group_ids` (orphans removed)
  - `missing_members` + `total_missing` (no roster match)
- [x] Disable edit controls during import operation
- [x] Note: All imported groups remain mutable (`origin: "local"`)

### Preview Re-import Group Set

- [x] Validate `group_set_id` exists and is `connection.kind: "import"`
- [x] Parse and validate file (same rules as re-import)
- [x] If CSV `group_set_id` is present, decode base58 -> UUID and compare with target set ID; mismatch fails preview
- [x] Compare groups using decoded `group_id` when present; fallback to `group_name` to compute:
  - `added_group_names`: present in file, not in existing set
  - `removed_group_names`: present in existing set, not in file
  - `updated_group_names`: present in both and membership set changes after dedupe + roster matching (added/removed members or empty/non-empty change)
  - `renamed_groups`: present in both by ID match, name differs (`from` -> `to`)
- [x] Build `GroupSetImportPreview` with `mode: "reimport"`, `groups` summary, name-diff lists, and missing counts
- [x] Do not generate UUIDs or mutate roster

### Export Group Set

- [x] Export to CSV format
- [x] Columns: `group_set_id`, `group_id`, `group_name`, `name`, `email`
- [x] `group_set_id` and `group_id` exported as base58-encoded UUIDs for re-import matching
- [x] `name` and `email` are roster member fields (for human readability; email also used for member matching on import)
- [x] Write membership rows as stored in the group; staff are included where present
- [x] Group names are taken directly from `Group.name`

## CSV Import/Export Format

**Header row:**

```csv
group_set_id,group_id,group_name,name,email
```

**Import rules:**

- Header row required.
- `group_set_id` and `group_id` columns are optional, but when present must appear as the first two columns.
- Required columns: `group_name` (`email` required only for membership rows).
- Optional columns: `group_set_id`, `group_id`, `name` (ignored on import beyond validation).
- ID column handling (canonical rules — checklist items defer here):
  - `group_set_id` and `group_id` are **always decoded** when the column is present. Invalid base58 values are hard errors regardless of import mode.
  - A blank cell in an ID column is allowed and treated as "absent" (no decode, no error).
  - **New import:** decoded `group_set_id` and `group_id` UUIDs are discarded after validation (not used for matching). New UUIDs are generated for both set and groups.
  - **Re-import:** `group_set_id` must match the target set (mismatch is a hard error). `group_id` is used for group matching (fallback to `group_name` when blank/absent).
- Base58 alphabet: `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`
- Roster member matching: email (case-insensitive, whitespace trimmed). No match → reported in `missing_members`. Multiple roster members sharing the same email → ambiguous, omitted from `member_ids` and reported in `missing_members` with reason.
- Empty email rows are allowed only to represent an empty group; otherwise skip the row with a warning.
- Group name matching: case-sensitive (exact match), whitespace trimmed.
- Each `group_id` must map to exactly one `group_name` within a file (1:1); a `group_id` appearing with multiple `group_name` values is a hard error.
- `group_name` is required; empty `group_name` is a hard error.
- Duplicate `group_name` rows treated as same group (members merged).
- Duplicate (`group_name`, `email`) membership rows rejected with error.
- Empty-group rows: allow a single row with empty `email` per `group_name` to represent an empty group.
- Roster members not found are reported but not blocking; missing members are omitted from `member_ids`.

**Export rules:**

- One row per group membership (member appears multiple times if in multiple groups)
- `group_set_id` and `group_id` exported as base58-encoded UUID transport values
- `name` and `email` populated from roster member data
- Groups with no members are included (single row with empty `name` and `email`)
- `group_set_id` is repeated on every row; `group_id` is included per group to enable stable re-import matching

## Files to Modify

- `apps/repo-manage/core/src/operations/group_set.rs` (CSV parse/export)
- `apps/repo-manage/core/src/roster/` (XLSX export fields)
