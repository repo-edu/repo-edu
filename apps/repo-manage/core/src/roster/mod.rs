//! Roster management module.
//!
//! Provides types, validation, and utilities for managing course rosters,
//! groups, group sets, and assignments.

pub mod export;
pub mod glob;
pub mod naming;
pub mod nanoid;
pub mod resolution;
pub mod slug;
pub mod system;
pub mod types;
pub mod validation;

// Re-export commonly used items from submodules
pub use export::{
    export_assignment_students, export_groups_for_edit, export_students, export_teams,
};
pub use glob::{validate_glob_pattern, SimpleGlob};
pub use naming::{generate_group_name, generate_unique_group_name, resolve_collision};
pub use nanoid::{
    generate_assignment_id, generate_group_id, generate_group_set_id, generate_roster_member_id,
    generate_uuid,
};
pub use resolution::{
    filter_by_pattern, preview_group_selection, resolve_assignment_groups,
    resolve_groups_from_selection, selection_mode_all, selection_mode_pattern,
};
pub use slug::{compute_repo_name, expand_template, slugify};
pub use system::{
    ensure_system_group_sets, find_system_set, system_sets_missing, ORIGIN_LMS, ORIGIN_LOCAL,
    ORIGIN_SYSTEM, STAFF_GROUP_NAME, SYSTEM_TYPE_INDIVIDUAL_STUDENTS, SYSTEM_TYPE_STAFF,
};
pub use types::{
    Assignment, AssignmentId, AssignmentMetadata, EnrollmentType, GitIdentityMode,
    GitUsernameStatus, Group, GroupDraft, GroupSelectionMode, GroupSet, GroupSetConnection,
    MemberStatus, Roster, RosterConnection, RosterMember, RosterMemberDraft, RosterMemberId,
    ValidationResult,
};
pub use validation::{validate_assignment, validate_assignment_with_template, validate_roster};

use std::collections::HashSet;

/// Returns only the member IDs from a group that correspond to active roster members.
///
/// Non-system groups preserve all member IDs (including non-active members) in the data model.
/// This helper filters to active members at consumption time (display, operations, exports).
pub fn active_member_ids(roster: &Roster, group: &Group) -> Vec<RosterMemberId> {
    let active_ids: HashSet<&RosterMemberId> = roster
        .students
        .iter()
        .chain(roster.staff.iter())
        .filter(|m| m.status == MemberStatus::Active)
        .map(|m| &m.id)
        .collect();
    group
        .member_ids
        .iter()
        .filter(|id| active_ids.contains(id))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests;
