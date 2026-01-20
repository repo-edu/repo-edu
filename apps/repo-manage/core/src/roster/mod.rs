pub mod export;
pub mod group_edit;
pub mod nanoid;
pub mod slug;
pub mod types;
pub mod validation;

pub use crate::generated::types::{AffectedGroup, StudentRemovalCheck, StudentRemovalResult};
pub use export::{
    export_assignment_students, export_groups_for_edit, export_roster_coverage, export_students,
    export_teams, get_roster_coverage,
};
pub use group_edit::import_groups_from_file;
pub use nanoid::{
    generate_assignment_id, generate_group_id, generate_group_set_id, generate_student_id,
};
pub use slug::{compute_repo_name, expand_template, slugify};
pub use types::{
    Assignment, AssignmentId, AssignmentMetadata, AssignmentType, GitIdentityMode,
    GitUsernameStatus, Group, GroupDraft, GroupId, Roster, RosterSource, Student, StudentDraft,
    StudentId, StudentStatus, ValidationResult,
};
pub use validation::{validate_assignment, validate_assignment_with_template, validate_roster};

#[cfg(test)]
mod tests;
