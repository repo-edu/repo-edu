# Phase 1: Schema & Types

See [plan.md](./plan.md) for overview and [plan-0-data-model.md](./plan-0-data-model.md) for entity definitions.

## Checklist

### Create New Schemas

- [ ] `GroupSet.schema.json` — replaces `LmsGroupSetCacheEntry`, references groups by ID
- [ ] `GroupSetConnection.schema.json` — tagged union: system, canvas, moodle, import
- [ ] `GroupSelectionMode.schema.json` — mode + glob pattern + per-group exclusions (UUIDs)
- [ ] `GroupSelectionPreview.schema.json` — backend preview result for group selection validation/resolution
- [ ] `PatternFilterResult.schema.json` — backend result for local pattern filtering (`filter_by_pattern`)
- [ ] `RosterConnection.schema.json` — tagged union: canvas, moodle, import
- [ ] `GroupSetSyncResult.schema.json` — sync result with missing member counts
- [ ] `GroupSetImportResult.schema.json` — import result with missing member counts
- [ ] `GroupSetImportPreview.schema.json` — preview payload for import/reimport dialogs
- [ ] `SystemGroupSetEnsureResult.schema.json` — ensure result for system group sets (idempotent bootstrap/repair)
- [ ] `EnrollmentType.schema.json` — enum for user enrollment/role types
- [ ] `MemberStatus.schema.json` — enum for internal normalized member status

### Update Existing Schemas

- [ ] `Group.schema.json` — UUID id, add `origin` (system/lms/local), keep `lms_group_id` for sync matching
- [ ] `RosterMemberId.schema.json` — switch to UUID format (canonical internal roster-member ID)
- [ ] `Assignment.schema.json` — remove `groups`, require `group_set_id`, add `group_selection`
- [ ] `RosterMember.schema.json` — add `enrollment_type`, `source`, `department`, `institution`
- [ ] `Roster.schema.json` — add top-level `groups` array, split `students` and `staff`, replace `lms_group_sets` with `group_sets`, `source` with `connection` (required but nullable)
- [ ] `ImportRosterResult.schema.json` — add conflict reporting fields for roster sync

**Schema update checklist note:**

- [ ] `roster.connection` must be **required** but **nullable**. Ensure all schema updates, fixtures, and default builders include `connection: null` when disconnected to avoid silent regressions.

### Delete Obsolete Schemas

- [ ] `GroupId.schema.json` — Group.id is now UUID string directly
- [ ] `LmsGroupSetCacheEntry.schema.json` — replaced by `GroupSet`
- [ ] `GroupSetKind.schema.json` — no longer needed
- [ ] `RosterSource.schema.json` — replaced by `RosterConnection`
- [ ] `CachedLmsGroup.schema.json` — replaced by `Group`
- [ ] `GroupFilter.schema.json` — replaced by `GroupSelectionMode`
- [ ] `AssignmentType.schema.json` — obsolete (group structure determined by `group_set_id` + `group_selection`)

### Generate Bindings

- [ ] Run `pnpm gen:bindings`
- [ ] Verify TypeScript types compile
- [ ] Verify Rust types compile

---

## Files to Modify

**Create:**

- `apps/repo-manage/schemas/types/GroupSet.schema.json`
- `apps/repo-manage/schemas/types/GroupSetConnection.schema.json`
- `apps/repo-manage/schemas/types/GroupSelectionMode.schema.json`
- `apps/repo-manage/schemas/types/GroupSelectionPreview.schema.json`
- `apps/repo-manage/schemas/types/PatternFilterResult.schema.json`
- `apps/repo-manage/schemas/types/RosterConnection.schema.json`
- `apps/repo-manage/schemas/types/GroupSetSyncResult.schema.json`
- `apps/repo-manage/schemas/types/GroupSetImportResult.schema.json`
- `apps/repo-manage/schemas/types/GroupSetImportPreview.schema.json`
- `apps/repo-manage/schemas/types/SystemGroupSetEnsureResult.schema.json`
- `apps/repo-manage/schemas/types/EnrollmentType.schema.json`
- `apps/repo-manage/schemas/types/MemberStatus.schema.json`
- `apps/repo-manage/schemas/types/ImportConflict.schema.json`

**Update:**

- `apps/repo-manage/schemas/types/Group.schema.json`
- `apps/repo-manage/schemas/types/RosterMemberId.schema.json`
- `apps/repo-manage/schemas/types/Assignment.schema.json`
- `apps/repo-manage/schemas/types/RosterMember.schema.json`
- `apps/repo-manage/schemas/types/Roster.schema.json`
- `apps/repo-manage/schemas/types/ImportRosterResult.schema.json`
- `apps/repo-manage/schemas/types/ImportConflict.schema.json` (new)

**Delete:**

- `apps/repo-manage/schemas/types/GroupId.schema.json`
- `apps/repo-manage/schemas/types/LmsGroupSetCacheEntry.schema.json`
- `apps/repo-manage/schemas/types/GroupSetKind.schema.json`
- `apps/repo-manage/schemas/types/RosterSource.schema.json`
- `apps/repo-manage/schemas/types/CachedLmsGroup.schema.json`
- `apps/repo-manage/schemas/types/GroupFilter.schema.json`
- `apps/repo-manage/schemas/types/AssignmentType.schema.json`

---

## Schema Definitions

### `EnrollmentType.schema.json` (new)

Enrollment/role type from LMS. Used to split roster members into `students` vs `staff`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "EnrollmentType.schema.json",
  "title": "EnrollmentType",
  "type": "string",
  "enum": ["student", "teacher", "ta", "designer", "observer", "other"],
  "description": "User enrollment type from LMS (Canvas enrollment type or Moodle role)"
}
```

**LMS field mappings:**

- Canvas `enrollment.type`:
  - `StudentEnrollment` → `student`
  - `TeacherEnrollment` → `teacher`
  - `TaEnrollment` → `ta`
  - `DesignerEnrollment` → `designer`
  - `ObserverEnrollment` → `observer`
- Moodle `role.shortname`:
  - `student` → `student`
  - `teacher`, `editingteacher`, `manager` → `teacher`
  - `coursecreator` → `designer`
  - others → `other`

---

### `MemberStatus.schema.json` (new)

Internal normalized status for app logic (filtering, coverage calculations). See `enrollment_display` for user-facing LMS labels.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "MemberStatus.schema.json",
  "title": "MemberStatus",
  "type": "string",
  "enum": ["active", "incomplete", "dropped"],
  "description": "Internal normalized roster member status for filtering and coverage calculations"
}
```

**Status meanings:**

- `active` — Member is fully enrolled and participating
- `incomplete` — Member enrollment is pending (invited, not yet started)
- `dropped` — Member is no longer active (inactive, completed, deleted, suspended, ended)

See `plan-0-data-model.md` for Canvas/Moodle state mappings.

---

### `GroupSet.schema.json` (new)

Replaces `LmsGroupSetCacheEntry`. Delete `GroupSetKind` enum (no longer needed).

GroupSet now references groups by ID instead of embedding them. Groups are top-level entities in the Roster.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "GroupSet.schema.json",
  "title": "GroupSet",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "Unique stable identifier (UUID)"
    },
    "name": {
      "type": "string"
    },
    "group_ids": {
      "type": "array",
      "items": { "type": "string", "format": "uuid" },
      "uniqueItems": true,
      "description": "References to Group entities by ID"
    },
    "connection": {
      "anyOf": [
        { "$ref": "./GroupSetConnection.schema.json" },
        { "type": "null" }
      ],
      "description": "Connection info, or null for local group sets"
    }
  },
  "additionalProperties": false,
  "required": ["id", "name", "group_ids", "connection"]
}
```

### `Group.schema.json` (update)

Group is now a top-level profile entity with UUID. The `origin` field encodes editability. The `lms_group_id` field stores the LMS identifier for sync matching (replaces storing mappings in GroupSet connection metadata).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "Group.schema.json",
  "title": "Group",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "Unique stable identifier (UUID)"
    },
    "name": {
      "type": "string"
    },
    "member_ids": {
      "type": "array",
      "items": { "$ref": "./RosterMemberId.schema.json" },
      "uniqueItems": true,
      "description": "Roster member IDs"
    },
    "origin": {
      "type": "string",
      "enum": ["system", "lms", "local"],
      "description": "Group origin; editability is origin-based"
    },
    "lms_group_id": {
      "anyOf": [{ "type": "string" }, { "type": "null" }],
      "description": "LMS group ID for sync matching (Canvas group_id / Moodle group id)"
    }
  },
  "additionalProperties": false,
  "required": ["id", "name", "member_ids", "origin", "lms_group_id"],
  "allOf": [
    {
      "if": {
        "required": ["origin"],
        "properties": { "origin": { "const": "lms" } }
      },
      "then": { "properties": { "lms_group_id": { "type": "string" } } }
    },
    {
      "if": {
        "required": ["origin"],
        "properties": { "origin": { "enum": ["system", "local"] } }
      },
      "then": { "properties": { "lms_group_id": { "type": "null" } } }
    }
  ],
  "description": "Group entity (top-level, can be referenced by multiple GroupSets)"
}
```

**Editability:** A group is mutable iff `origin === "local"`. This is determined by origin, not by which sets reference the group.

### `GroupSetConnection.schema.json` (new)

Connection metadata for the GroupSet. Note: LMS group ID mappings are **not** stored here — they live on the Group entity itself (`lms_group_id`).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "GroupSetConnection.schema.json",
  "title": "GroupSetConnection",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "kind": { "const": "system" },
        "system_type": { "enum": ["individual_students", "staff"] }
      },
      "required": ["kind", "system_type"],
      "additionalProperties": false,
      "description": "System-maintained group set (auto-syncs with roster)"
    },
    {
      "type": "object",
      "properties": {
        "kind": { "const": "canvas" },
        "course_id": { "type": "string" },
        "group_set_id": { "type": "string" },
        "last_updated": { "type": "string", "format": "date-time" }
      },
      "required": ["kind", "course_id", "group_set_id", "last_updated"],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "kind": { "const": "moodle" },
        "course_id": { "type": "string" },
        "grouping_id": { "type": "string" },
        "last_updated": { "type": "string", "format": "date-time" }
      },
      "required": ["kind", "course_id", "grouping_id", "last_updated"],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "kind": { "const": "import" },
        "source_filename": { "type": "string", "description": "Original filename for display" },
        "last_updated": { "type": "string", "format": "date-time" }
      },
      "required": ["kind", "source_filename", "last_updated"],
      "additionalProperties": false,
      "description": "Imported from CSV. Groups are mutable (origin: local, lms_group_id: null). Set is editable."
    }
  ]
}
```

**Connection type behaviors:**

| Kind | Set-level editable | Group origin | Group-level editable |
|------|-------------------|-------------|---------------------|
| `system` | No | `system` | No |
| `canvas` | No | `lms` | No |
| `moodle` | No | `lms` | No |
| `import` | Yes | `local` | Yes |
| Local (`null`) | Yes | `local` | Yes (for new groups) |

### `Assignment.schema.json` (update)

Changes from current:

- Remove embedded `groups` array (groups now come from referenced GroupSet)
- Remove `assignment_type` (obsolete — group structure is now determined by `group_set_id` + `group_selection`)
- Make `group_set_id` required (was optional)
- Add `group_selection` to specify group filtering

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "Assignment.schema.json",
  "title": "Assignment",
  "type": "object",
  "properties": {
    "id": {
      "$ref": "./AssignmentId.schema.json"
    },
    "name": {
      "type": "string"
    },
    "description": {
      "anyOf": [
        { "type": "string" },
        { "type": "null" }
      ]
    },
    "group_set_id": {
      "type": "string",
      "format": "uuid",
      "description": "Reference to group set by ID (required)"
    },
    "group_selection": {
      "$ref": "./GroupSelectionMode.schema.json",
      "description": "How to select groups from the group set"
    }
  },
  "additionalProperties": false,
  "required": ["id", "name", "group_set_id", "group_selection"],
  "description": "Assignment grouping roster members into repos"
}
```

### `GroupSelectionMode.schema.json` (new)

Discriminated union with different shapes per kind. Uses UUIDs for `excluded_group_ids` since groups are now top-level entities.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "GroupSelectionMode.schema.json",
  "title": "GroupSelectionMode",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "kind": { "const": "all" },
        "excluded_group_ids": {
          "type": "array",
          "items": { "type": "string", "format": "uuid" },
          "description": "Explicitly excluded groups (by group UUID)"
        }
      },
      "additionalProperties": false,
      "required": ["kind", "excluded_group_ids"]
    },
    {
      "type": "object",
      "properties": {
        "kind": { "const": "pattern" },
        "pattern": {
          "type": "string",
          "minLength": 1,
          "description": "Validated simple glob pattern matched against group name (e.g., \"1D*\")"
        },
        "excluded_group_ids": {
          "type": "array",
          "items": { "type": "string", "format": "uuid" },
          "description": "Explicitly excluded groups (by group UUID)"
        }
      },
      "additionalProperties": false,
      "required": ["kind", "pattern", "excluded_group_ids"]
    }
  ]
}
```

**Validation:** The `pattern` field must be a valid **simple glob** (string match) with only `*`, `?`, `[...]`, `[!...]`, and `\\` escapes. Disallow `**`, `[^...]`, extglobs, and brace expansion. Invalid patterns are rejected by backend validation and surfaced inline in the UI.

### `GroupSelectionPreview.schema.json` (new)

Backend preview result for group selection validation and resolution. Frontend uses this for inline pattern feedback and the resolved groups preview.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "GroupSelectionPreview.schema.json",
  "title": "GroupSelectionPreview",
  "type": "object",
  "properties": {
    "valid": {
      "type": "boolean",
      "description": "False when the glob pattern is invalid"
    },
    "error": {
      "anyOf": [{ "type": "string" }, { "type": "null" }],
      "description": "Validation error message when valid=false"
    },
    "group_ids": {
      "type": "array",
      "items": { "type": "string", "format": "uuid" },
      "description": "Resolved group IDs after applying group_selection and exclusions (ordered as in group set)"
    },
    "empty_group_ids": {
      "type": "array",
      "items": { "type": "string", "format": "uuid" },
      "description": "Resolved group IDs that have zero members"
    },
    "group_member_counts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "group_id": { "type": "string", "format": "uuid" },
          "member_count": { "type": "integer", "minimum": 0 }
        },
        "required": ["group_id", "member_count"],
        "additionalProperties": false
      },
      "description": "Per-group member counts (parallel to group_ids)"
    },
    "total_groups": {
      "type": "integer",
      "minimum": 0,
      "description": "Total groups in the selected group set"
    },
    "matched_groups": {
      "type": "integer",
      "minimum": 0,
      "description": "Count of groups matched by selection before exclusions (for kind=all, equals total_groups)"
    }
  },
  "required": [
    "valid",
    "error",
    "group_ids",
    "empty_group_ids",
    "group_member_counts",
    "total_groups",
    "matched_groups"
  ],
  "additionalProperties": false
}
```

**Behavior:**

- When `valid=false`, `group_ids` must be empty.
- When `valid=true`, `error` is null and `group_ids` are ordered as in the group set.
- `group_member_counts` must align with `group_ids` order; frontend uses these values for empty-group counts and preview display.

### `PatternFilterResult.schema.json` (new)

Backend result for `filter_by_pattern`, used by debounced frontend local filters.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "PatternFilterResult.schema.json",
  "title": "PatternFilterResult",
  "type": "object",
  "properties": {
    "valid": {
      "type": "boolean",
      "description": "False when the glob pattern is invalid"
    },
    "error": {
      "anyOf": [{ "type": "string" }, { "type": "null" }],
      "description": "Validation error message when valid=false"
    },
    "matched_indexes": {
      "type": "array",
      "items": { "type": "integer", "minimum": 0 },
      "description": "Indexes of matched values in input order"
    },
    "matched_count": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": ["valid", "error", "matched_indexes", "matched_count"],
  "additionalProperties": false
}
```

**Behavior:**

- When `valid=false`, `matched_indexes` must be empty and `matched_count` must be `0`.
- When `valid=true`, `error` is null and `matched_indexes` preserves input order.

### `ImportConflict.schema.json` (new)

Conflict detail for roster sync when multiple existing roster members match a single LMS identity key.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "ImportConflict.schema.json",
  "title": "ImportConflict",
  "type": "object",
  "properties": {
    "match_key": {
      "type": "string",
      "enum": ["lms_user_id", "email", "student_number"]
    },
    "value": {
      "type": "string",
      "description": "Conflicting key value from LMS payload"
    },
    "matched_ids": {
      "type": "array",
      "items": { "$ref": "./RosterMemberId.schema.json" },
      "minItems": 2
    }
  },
  "required": ["match_key", "value", "matched_ids"],
  "additionalProperties": false
}
```

### `ImportRosterResult.schema.json` (update)

Add conflict reporting for LMS roster sync.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ImportRosterResult",
  "type": "object",
  "properties": {
    "summary": { "$ref": "./ImportSummary.schema.json" },
    "roster": { "$ref": "./Roster.schema.json" },
    "conflicts": {
      "type": "array",
      "items": { "$ref": "./ImportConflict.schema.json" }
    },
    "total_conflicts": {
      "type": "integer",
      "minimum": 0
    }
  },
  "additionalProperties": false,
  "required": ["summary", "roster", "conflicts", "total_conflicts"]
}
```

### `GroupSetSyncResult.schema.json` (new)

Patch payload for `sync_group_set`. The backend returns a **partial roster update**; the frontend merges via the contract in `plan-0-commands.md`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "GroupSetSyncResult.schema.json",
  "title": "GroupSetSyncResult",
  "type": "object",
  "properties": {
    "group_set": { "$ref": "./GroupSet.schema.json" },
    "groups_upserted": {
      "type": "array",
      "items": { "$ref": "./Group.schema.json" }
    },
    "deleted_group_ids": {
      "type": "array",
      "items": { "type": "string", "format": "uuid" }
    },
    "missing_members": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "group_name": { "type": "string" },
          "missing_count": { "type": "integer", "minimum": 1 }
        },
        "required": ["group_name", "missing_count"],
        "additionalProperties": false
      }
    },
    "total_missing": { "type": "integer", "minimum": 0 }
  },
  "required": [
    "group_set",
    "groups_upserted",
    "deleted_group_ids",
    "missing_members",
    "total_missing"
  ],
  "additionalProperties": false
}
```

### `GroupSetImportResult.schema.json` (new)

Patch payload for `import_group_set` and `reimport_group_set`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "GroupSetImportResult.schema.json",
  "title": "GroupSetImportResult",
  "type": "object",
  "properties": {
    "mode": { "type": "string", "enum": ["import", "reimport"] },
    "group_set": { "$ref": "./GroupSet.schema.json" },
    "groups_upserted": {
      "type": "array",
      "items": { "$ref": "./Group.schema.json" }
    },
    "deleted_group_ids": {
      "type": "array",
      "items": { "type": "string", "format": "uuid" }
    },
    "missing_members": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "group_name": { "type": "string" },
          "missing_count": { "type": "integer", "minimum": 1 }
        },
        "required": ["group_name", "missing_count"],
        "additionalProperties": false
      }
    },
    "total_missing": { "type": "integer", "minimum": 0 }
  },
  "required": [
    "mode",
    "group_set",
    "groups_upserted",
    "deleted_group_ids",
    "missing_members",
    "total_missing"
  ],
  "additionalProperties": false
}
```

### `GroupSetImportPreview.schema.json` (new)

Preview payload for import and re-import dialogs.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "GroupSetImportPreview.schema.json",
  "title": "GroupSetImportPreview",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "mode": { "const": "import" },
        "groups": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "member_count": { "type": "integer", "minimum": 0 }
            },
            "required": ["name", "member_count"],
            "additionalProperties": false
          }
        },
        "missing_members": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "group_name": { "type": "string" },
              "missing_count": { "type": "integer", "minimum": 1 }
            },
            "required": ["group_name", "missing_count"],
            "additionalProperties": false
          }
        },
        "total_missing": { "type": "integer", "minimum": 0 }
      },
      "required": ["mode", "groups", "missing_members", "total_missing"],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "mode": { "const": "reimport" },
        "groups": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "member_count": { "type": "integer", "minimum": 0 }
            },
            "required": ["name", "member_count"],
            "additionalProperties": false
          }
        },
        "missing_members": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "group_name": { "type": "string" },
              "missing_count": { "type": "integer", "minimum": 1 }
            },
            "required": ["group_name", "missing_count"],
            "additionalProperties": false
          }
        },
        "total_missing": { "type": "integer", "minimum": 0 },
        "added_group_names": { "type": "array", "items": { "type": "string" } },
        "removed_group_names": { "type": "array", "items": { "type": "string" } },
        "updated_group_names": { "type": "array", "items": { "type": "string" } },
        "renamed_groups": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "from": { "type": "string" },
              "to": { "type": "string" }
            },
            "required": ["from", "to"],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "mode",
        "groups",
        "missing_members",
        "total_missing",
        "added_group_names",
        "removed_group_names",
        "updated_group_names",
        "renamed_groups"
      ],
      "additionalProperties": false
    }
  ]
}
```

### `SystemGroupSetEnsureResult.schema.json` (new)

Bootstrap payload for `ensure_system_group_sets`. Returns system group sets plus any groups updated by roster normalization (system or non-system).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "SystemGroupSetEnsureResult.schema.json",
  "title": "SystemGroupSetEnsureResult",
  "type": "object",
  "properties": {
    "group_sets": {
      "type": "array",
      "items": { "$ref": "./GroupSet.schema.json" },
      "description": "System group sets (individual_students + staff)"
    },
    "groups_upserted": {
      "type": "array",
      "items": { "$ref": "./Group.schema.json" }
    },
    "deleted_group_ids": {
      "type": "array",
      "items": { "type": "string", "format": "uuid" }
    }
  },
  "required": [
    "group_sets",
    "groups_upserted",
    "deleted_group_ids"
  ],
  "additionalProperties": false
}
```

### `RosterMemberId.schema.json` (update)

Make `RosterMemberId` UUID-backed so roster-member IDs align with the rest of the internal identity model.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "RosterMemberId.schema.json",
  "title": "RosterMemberId",
  "type": "string",
  "format": "uuid",
  "x-rust": {
    "newtype": true,
    "type": "String"
  },
  "description": "Canonical internal roster-member ID (UUID)"
}
```

### `RosterMember.schema.json` (update)

Extends existing schema with new fields for roster connection support and Moodle fields. All existing fields are preserved.

New fields:

- `enrollment_type`: User role from LMS (student, teacher, TA, etc.)
- `source`: Origin of member (lms or local)
- `department`: Moodle department field
- `institution`: Moodle institution field
- `enrollment_display`: LMS-native label for UI (e.g., "Invited", "Suspended")

Field mappings from LMS:

- `student_number` ← Canvas `sis_user_id` / Moodle `idnumber`
- `enrollment_type` ← Canvas `enrollment.type` / Moodle `role.shortname`
- `lms_user_id` and `student_number` are external identifiers used for matching/merge logic; they do not replace `id`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "RosterMember.schema.json",
  "title": "RosterMember",
  "type": "object",
  "properties": {
    "id": {
      "$ref": "./RosterMemberId.schema.json"
    },
    "name": {
      "type": "string"
    },
    "email": {
      "type": "string"
    },
    "student_number": {
      "anyOf": [{ "type": "string" }, { "type": "null" }],
      "description": "Institution ID (Canvas sis_user_id / Moodle idnumber)"
    },
    "git_username": {
      "anyOf": [{ "type": "string" }, { "type": "null" }]
    },
    "git_username_status": {
      "$ref": "./GitUsernameStatus.schema.json"
    },
    "status": {
      "$ref": "./MemberStatus.schema.json",
      "default": "active"
    },
    "lms_user_id": {
      "anyOf": [{ "type": "string" }, { "type": "null" }]
    },
    "enrollment_type": {
      "$ref": "./EnrollmentType.schema.json",
      "description": "User role from LMS (student, teacher, TA, etc.)",
      "default": "student"
    },
    "enrollment_display": {
      "anyOf": [{ "type": "string" }, { "type": "null" }],
      "description": "LMS-native enrollment label for UI (e.g., Invited, Suspended)"
    },
    "department": {
      "anyOf": [{ "type": "string" }, { "type": "null" }],
      "description": "Moodle department field"
    },
    "institution": {
      "anyOf": [{ "type": "string" }, { "type": "null" }],
      "description": "Moodle institution field"
    },
    "source": {
      "type": "string",
      "enum": ["lms", "local"],
      "description": "Origin of roster member: synced from LMS or added locally",
      "default": "local"
    }
  },
  "additionalProperties": false,
  "required": ["id", "name", "email", "git_username_status", "status", "enrollment_type", "source"],
  "description": "Roster member entry (student or staff)"
}
```

**Naming:** The type is `RosterMember` — used for both `roster.students` and `roster.staff` partitions. Derivative types use the shorter `Member` prefix (e.g., `MemberStatus`) — see rationale in [plan-0-data-model.md](./plan-0-data-model.md#roster-model).

**Defaults (local creation):**

- `status`: `"active"`
- `enrollment_type`: `"student"`
- `source`: `"local"`

### `RosterConnection.schema.json` (new)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "RosterConnection.schema.json",
  "title": "RosterConnection",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "kind": { "const": "canvas" },
        "course_id": { "type": "string" },
        "last_updated": { "type": "string", "format": "date-time" }
      },
      "required": ["kind", "course_id", "last_updated"],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "kind": { "const": "moodle" },
        "course_id": { "type": "string" },
        "last_updated": { "type": "string", "format": "date-time" }
      },
      "required": ["kind", "course_id", "last_updated"],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "kind": { "const": "import" },
        "source_filename": { "type": "string", "description": "Original filename for display" },
        "last_updated": { "type": "string", "format": "date-time" }
      },
      "required": ["kind", "source_filename", "last_updated"],
      "additionalProperties": false
    }
  ]
}
```

### `Roster.schema.json` (update)

Changes from current:

- Add top-level `groups` array (groups are now first-class entities)
- Split roster members into `students` and `staff` arrays (both use `RosterMember.schema.json`)
- Replace `lms_group_sets` with `group_sets` (which reference groups by ID)
- Replace `source` with `connection` (new RosterConnection type, required but nullable)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "Roster.schema.json",
  "title": "Roster",
  "type": "object",
  "properties": {
    "connection": {
      "anyOf": [
        { "$ref": "./RosterConnection.schema.json" },
        { "type": "null" }
      ],
      "description": "Roster connection info, or null if not connected to LMS"
    },
    "students": {
      "type": "array",
      "items": { "$ref": "./RosterMember.schema.json" }
    },
    "staff": {
      "type": "array",
      "items": { "$ref": "./RosterMember.schema.json" }
    },
    "groups": {
      "type": "array",
      "items": { "$ref": "./Group.schema.json" },
      "description": "All groups (top-level entities, referenced by group sets)"
    },
    "group_sets": {
      "type": "array",
      "items": { "$ref": "./GroupSet.schema.json" },
      "description": "All group sets (reference groups by ID)"
    },
    "assignments": {
      "type": "array",
      "items": { "$ref": "./Assignment.schema.json" }
    }
  },
  "additionalProperties": false,
  "required": ["connection", "students", "staff", "groups", "group_sets", "assignments"],
  "description": "Roster data for a course"
}
```

**Invariants:**

- Every group referenced by a GroupSet must exist in `groups`
- Orphaned groups (not referenced by any set) should be cleaned up on mutation
- `students` entries must have `enrollment_type === "student"`; `staff` entries must have `enrollment_type !== "student"`
- `connection` must always be present (explicit `null` when disconnected)
