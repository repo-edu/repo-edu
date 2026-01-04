pub mod nanoid;
pub mod slug;
pub mod types;
pub mod validation;

pub use nanoid::{generate_assignment_id, generate_group_id, generate_student_id};
pub use slug::{compute_repo_name, expand_template, slugify};
pub use types::{
    Assignment, AssignmentId, AssignmentMetadata, GitIdentityMode, GitUsernameStatus, Group,
    GroupDraft, GroupId, Roster, RosterSource, Student, StudentDraft, StudentId,
};
pub use validation::{validate_assignment, validate_assignment_with_template, validate_roster};

#[cfg(test)]
mod tests;
