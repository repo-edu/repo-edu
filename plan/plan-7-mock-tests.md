# Phase 7: Mock Backend and Tests

See [plan.md](./plan.md) for overview.

**Prerequisites:** Complete [Phase 6: Store Updates](./plan-6-stores.md)

## Checklist

### Mock Backend and Fixtures

- [ ] Update `packages/backend-mock` demo data to new roster/group/group_set schema and selectors
- [ ] Update any app-core tests/fixtures that reference old group-set fields or selectors

### Shared Fixtures

- [ ] Create shared JSON fixtures for:
  - Slug normalization (Rust tests only — no frontend slug implementation)
  - Group naming (raw name generation tested in both Rust and TS)
  - Simple glob matcher vectors (valid/invalid + expected matches) for backend matcher + `filter_by_pattern`
- [ ] Store in a single location (for example, `apps/repo-manage/core/tests/fixtures/group-naming.json`) and load from Rust tests and TS command-integration tests where applicable

### Tests (implement alongside backend logic)

#### Slug Normalization (Rust)

- [ ] Unicode to ASCII
- [ ] Apostrophe removal
- [ ] Whitespace collapsing
- [ ] Non-ASCII fallback (`member_<id>`)
- [ ] Empty result fallback

#### Group Naming (Rust)

- [ ] Individual: first word + last word (`Maria Jose Garcia Lopez` -> `maria_lopez`)
- [ ] 2-5 members: surname dashes (`Smith, Jones, Lee` -> `smith-jones-lee`)
- [ ] 6+ members: 5 surnames + remainder
- [ ] Collision resolution for individuals (student ID suffix)
- [ ] Collision resolution for groups (incrementing suffix)

#### Orphan Cleanup (Rust)

- [ ] Removes unreferenced groups
- [ ] Preserves groups referenced by multiple sets
- [ ] Handles empty group sets

#### Group Resolution (Rust)

- [ ] `kind: "all"` returns all groups
- [ ] `kind: "pattern"` filters by simple glob (string match)
- [ ] `excluded_group_ids` removes specific groups
- [ ] No membership filtering at resolve time — non-active students already removed from `member_ids` by `ensure_system_group_sets`
- [ ] Empty groups preserved (not filtered out)
- [ ] Group names are stable (dropouts do not change names)
- [ ] Simple glob vectors:
  - `1D*` matches `1D-team-a`
  - `[AB]-*` matches `A-group1` and `B-group2`
  - `?-solo` matches `X-solo`
  - `[!AB]-*` matches `C-group3` and not `A-group1`
  - `^team` matches `^team` (caret is literal)
  - `A\\[1\\]` matches `A[1]` (escape handling)
  - `literal\\\\*` matches `literal*` (escaped star)
  - `bracket\\[x\\]` matches `bracket[x]` (escaped brackets)
  - Invalid: `**`, `[^abc]`, `{a,b}`, `@(a|b)` rejected

#### Pattern Filter Command (TS + Rust Integration)

- [ ] `filter_by_pattern` returns `valid=false` with error for invalid patterns
- [ ] `filter_by_pattern` returns `matched_indexes` in input order for valid patterns
- [ ] `filter_by_pattern` uses the same fixture vectors as Rust matcher tests (no frontend matcher implementation)

#### Group Ordering (Rust + TypeScript)

- [ ] Imported group sets preserve CSV first-appearance order
- [ ] LMS group sets preserve LMS/API order (backend-sorted only if the API order is missing)
- [ ] Local/system group sets preserve stored `group_ids` order; new groups append
- [ ] No implicit re-sorting on group renames or membership changes

#### CSV Import (Rust)

- [ ] Duplicate `group_name` rows merge members
- [ ] Duplicate (`group_name`, `email`) membership rows rejected
- [ ] Empty-group row support (single empty-email row per group)
- [ ] Missing members reported per group (students or staff)
- [ ] Member matching by email only (case-insensitive, trimmed)
- [ ] Missing members are omitted from `member_ids` (no ghost IDs)
- [ ] Case-sensitive group name matching
- [ ] Member ID de-duplication (no duplicates in `member_ids`)
- [ ] Staff rows are accepted and included in group memberships when present in the roster
- [ ] Re-import matches by `group_id` when present, falls back to `group_name`
- [ ] Re-import preview reports `renamed_groups` when IDs match but names differ
- [ ] Export includes `group_set_id` and `group_id` columns for round-trip stability
- [ ] Base58 transport round-trip tests:
  - Decode `group_set_id`/`group_id` from CSV base58 -> UUID
  - Encode UUIDs back to base58 on export
  - Invalid base58 in `group_set_id`/`group_id` fails validation

#### LMS Sync (Rust)

- [ ] New groups created with UUID, `origin: "lms"`, and `lms_group_id` set
- [ ] Existing groups matched by `lms_group_id`
- [ ] Removed groups dereferenced
- [ ] Orphaned groups deleted
- [ ] Missing members counted per group
- [ ] Staff memberships from LMS are retained in `member_ids` (not dropped)
- [ ] Local sets referencing shared groups see updated data
- [ ] Local copies never sync their `group_ids`

#### System Set Ensure (Rust)

- [ ] Creates missing system group sets (individual_students + staff)
- [ ] Reuses existing system groups by member_ids/name to avoid UUID churn
- [ ] Removes member IDs from all groups (system, LMS, local, imported) when member is deleted or has `status !== "active"`

#### Group Editability (Rust + TypeScript)

- [ ] Group with `origin: "local"` -> mutable
- [ ] Group with `origin: "lms"` -> immutable
- [ ] Group with `origin: "system"` -> immutable
- [ ] Imported groups always have `origin: "local"` -> mutable

## Files to Modify

- `packages/backend-mock/src/`
- `packages/app-core/src/**/*.test.ts(x)`
- `apps/repo-manage/core/tests/fixtures/`
