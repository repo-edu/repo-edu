# Phase 7: Mock Backend and Tests

See [plan.md](./plan.md) for overview.

**Prerequisites:** Complete [Phase 6: Store Updates](./plan-6-stores.md)

## Checklist

### Mock Backend and Fixtures

- [x] Update `packages/backend-mock` demo data to new roster/group/group_set schema and selectors *(Phase 6)*
- [x] Update any app-core tests/fixtures that reference old group-set fields or selectors *(Phase 6)*

### Shared Fixtures

- [x] ~~Create shared JSON fixtures~~ — Skipped; Rust and TS implementations differ enough that shared vectors add complexity without proportional benefit. Both sides have thorough inline tests.

### Tests (implement alongside backend logic)

#### Slug Normalization (Rust)

- [x] Unicode to ASCII *(Phase 2 — `slug.rs`)*
- [x] Apostrophe removal *(Phase 7)*
- [x] Whitespace collapsing *(Phase 2 — hyphen collapsing test)*
- [x] Non-ASCII fallback — N/A, `slugify` uses `deunicode` which always produces ASCII
- [x] Empty result fallback *(Phase 7)*
- [x] Leading/trailing hyphen trimming *(Phase 7)*

#### Group Naming (Rust)

- [x] Individual: first word + last word *(Phase 2 — 10 tests in `naming.rs`)*
- [x] 2-5 members: surname dashes *(Phase 2)*
- [x] 6+ members: 5 surnames + remainder *(Phase 2)*
- [x] Collision resolution for individuals *(Phase 2)*
- [x] Collision resolution for groups *(Phase 2)*

#### Orphan Cleanup (Rust)

- [x] Removes unreferenced groups — covered by `cleanup_stale_memberships` in `system.rs` *(Phase 2)*
- [x] Preserves groups referenced by multiple sets *(Phase 2)*
- [x] Handles empty group sets *(Phase 2)*

#### Group Resolution (Rust)

- [x] `kind: "all"` returns all groups *(Phase 2 — 7 tests in `resolution.rs`)*
- [x] `kind: "pattern"` filters by simple glob *(Phase 2)*
- [x] `excluded_group_ids` removes specific groups *(Phase 2)*
- [x] No membership filtering at resolve time *(Phase 2)*
- [x] Empty groups preserved *(Phase 2)*
- [x] Group names are stable *(Phase 2)*
- [x] Simple glob vectors — 13 tests in `glob.rs` *(Phase 2)*

#### Pattern Filter Command (TS + Rust Integration)

- [ ] `filter_by_pattern` returns `valid=false` with error for invalid patterns — deferred to Phase 8-10
- [ ] `filter_by_pattern` returns `matched_indexes` in input order for valid patterns — deferred to Phase 8-10
- [ ] `filter_by_pattern` uses the same fixture vectors as Rust matcher tests — deferred to Phase 8-10

#### Group Ordering (Rust + TypeScript)

- [x] Imported group sets preserve CSV first-appearance order *(Phase 7)*
- [ ] LMS group sets preserve LMS/API order — requires async LMS client, deferred
- [x] Local/system group sets preserve stored `group_ids` order; new groups append *(Phase 2)*
- [x] No implicit re-sorting on group renames or membership changes *(Phase 2)*

#### CSV Import (Rust)

- [x] Duplicate `group_name` rows merge members *(Phase 7)*
- [x] Duplicate (`group_name`, `email`) membership rows rejected *(Phase 7)*
- [x] Empty-group row support — empty email rows produce groups with 0 members *(Phase 7 — `export_empty_group`)*
- [x] Missing members reported per group (students or staff) *(Phase 7)*
- [x] Member matching by email only (case-insensitive, trimmed) *(Phase 7)*
- [x] Missing members are omitted from `member_ids` (no ghost IDs) *(Phase 7)*
- [x] Case-sensitive group name matching *(Phase 7)*
- [x] Member ID de-duplication (no duplicates in `member_ids`) *(Phase 7)*
- [x] Staff rows are accepted and included in group memberships when present in the roster *(Phase 7)*
- [x] Re-import matches by `group_id` when present, falls back to `group_name` *(Phase 7)*
- [x] Re-import preview reports `renamed_groups` when IDs match but names differ *(Phase 7)*
- [x] Export includes `group_set_id` and `group_id` columns for round-trip stability *(Phase 7)*
- [x] Base58 transport round-trip tests *(Phase 4)*

#### LMS Sync (Rust)

- [ ] New groups created with UUID, `origin: "lms"`, and `lms_group_id` set — requires async LMS client
- [ ] Existing groups matched by `lms_group_id` — requires async LMS client
- [ ] Removed groups dereferenced — requires async LMS client
- [ ] Orphaned groups deleted — requires async LMS client
- [x] Missing members counted per group — `resolve_lms_member_ids` tested *(Phases 2 + 7)*
- [ ] Staff memberships from LMS are retained in `member_ids` — requires async LMS client
- [ ] Local sets referencing shared groups see updated data — requires async LMS client
- [ ] Local copies never sync their `group_ids` — requires async LMS client
- [x] `resolve_lms_member_ids` empty input *(Phase 7)*
- [x] `resolve_lms_member_ids` all unresolved *(Phase 7)*
- [x] `build_lms_member_map` indexes students and staff *(Phase 2)*

#### System Set Ensure (Rust)

- [x] Creates missing system group sets (individual_students + staff) *(Phase 2)*
- [x] Reuses existing system groups by member_ids/name to avoid UUID churn *(Phase 2 — idempotent test)*
- [x] Removes member IDs from all groups (system, LMS, local, imported) when member is deleted or has `status !== "active"` *(Phases 2 + 7)*

#### Group Editability (Rust + TypeScript)

- [x] Group with `origin: "local"` -> mutable *(Phase 2 — `Group::is_editable()`)*
- [x] Group with `origin: "lms"` -> immutable *(Phase 2)*
- [x] Group with `origin: "system"` -> immutable *(Phase 2)*
- [x] Imported groups always have `origin: "local"` -> mutable *(Phase 7 — `import_creates_local_groups`)*

## Files Modified

- `apps/repo-manage/core/src/roster/slug.rs` — 3 new tests
- `apps/repo-manage/core/src/operations/group_set.rs` — 16 new tests
- `apps/repo-manage/core/src/operations/lms.rs` — 2 new tests
- `apps/repo-manage/core/src/roster/system.rs` — 1 new test

## Pre-Done Items (from Phase 6 or Phases 2-4)

- Mock backend demo data updated (Phase 6)
- App-core test fixtures updated (Phase 6)
- Group naming tests — 10 tests in `naming.rs` (Phase 2)
- Glob matcher tests — 13 tests in `glob.rs` (Phase 2)
- Group resolution tests — 7 tests in `resolution.rs` (Phase 2)
- System ensure tests — 6 tests in `system.rs` (Phase 2)
- Base58 round-trip tests — 3 tests in `group_set.rs` (Phase 4)
- LMS member map tests — 2 tests in `lms.rs` (Phase 2)
- Group editability TS tests — `selectIsGroupEditable` in `selectors.test.ts` (Phase 6)

## Deferred Items

- **Shared JSON fixtures** — Skipped; implementations differ enough that shared vectors aren't beneficial
- **Pattern filter TS integration tests** — Deferred to Phases 8-10 (UI components)
- **Full LMS sync integration tests** — Requires async + LMS client mock; out of scope for unit tests
- **LMS API order preservation** — Requires async LMS client; deferred
