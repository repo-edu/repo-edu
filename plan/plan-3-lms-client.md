# Phase 3: LMS Client Mapping — COMPLETED

See [plan.md](./plan.md) for overview and [plan-0-data-model.md](./plan-0-data-model.md) for enrollment fields and roster behavior.

**Prerequisites:** Complete [Phase 2: Core Backend Model](./plan-2-core-backend.md) (**done**)

> **Status: DONE.** `EnrollmentType` enum added to `lms-common`, Canvas, and Moodle crates. Enrollment type mapping, filtering, and roster sync behavior all implemented. The checklist items below remain as reference documentation.

## Checklist

### LMS Common Types

- [x] Add `EnrollmentType` enum to `lms-common/src/types.rs`:

  ```rust
  pub enum EnrollmentType {
      Student,
      Teacher,
      Ta,
      Designer,
      Observer,
      Other,
  }
  ```

- [x] Add helper methods for Canvas/Moodle string -> `EnrollmentType` conversion
- [x] Add optional `enrollment_types: Option<Vec<EnrollmentType>>` filter parameter to user fetch trait methods

### LMS Library Updates (Canvas)

- [x] Add `enrollment_type[]` parameter support to course users endpoint
  - Allows filtering by: `StudentEnrollment`, `TeacherEnrollment`, `TaEnrollment`, `DesignerEnrollment`, `ObserverEnrollment`
- [x] Add `get_course_users_filtered` method with enrollment type filter option
- [x] Ensure enrollments are included in user response (already supported via `include[]=enrollments`)
- [x] Populate `RosterMember.enrollment_display` from Canvas `enrollment_state` mapping (see data model)

### LMS Library Updates (Moodle)

- [x] Update Moodle user fetch to retrieve missing fields:
  - `idnumber` -> maps to `student_number`
  - `department` -> maps to `department`
  - `institution` -> maps to `institution`
- [x] Map Moodle `roles[]` to `Enrollment` structure in `MoodleEnrolledUser` -> `User` conversion
  - Currently `MoodleEnrolledUser.roles` exists but is not mapped to `User.enrollments`
  - Add conversion: `MoodleRole` -> `Enrollment` with `role.shortname` mapped to `enrollment_type`
- [x] Update user conversion to populate new fields
- [x] Populate `RosterMember.enrollment_display` and `RosterMember.status` from Moodle enrollment timing/status rules (see data model)

### Roster Sync Behavior

- [x] Roster sync always imports all enrollment types (full sync); split into `roster.students` (student) and `roster.staff` (non-student) with no user-facing filter
- [x] Always populate `enrollment_type`, `enrollment_display`, and normalized `status`
- [x] Populate LMS identifiers (`lms_user_id`, `student_number`) as matching metadata only; never overwrite canonical internal `RosterMember.id` (UUID)

## Files to Modify

- `crates/lms-common/src/types.rs` (add `EnrollmentType` + conversions)
- `crates/canvas-lms/src/client.rs` (enrollment type filtering)
- `crates/canvas-lms/src/endpoints.rs` (query parameter support)
- `crates/moodle-lms/src/models.rs` (role mapping)
- `crates/moodle-lms/src/client.rs` (fetch extra fields)
