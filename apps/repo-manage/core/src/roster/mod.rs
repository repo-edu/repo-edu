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
pub use crate::generated::types::{AffectedGroup, StudentRemovalCheck, StudentRemovalResult};
pub use export::{
    export_assignment_students, export_groups_for_edit, export_roster_coverage, export_students,
    export_teams, get_roster_coverage,
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

#[cfg(test)]
mod tests;
