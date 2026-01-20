use std::collections::HashMap;
use std::fmt;

use super::nanoid::{generate_assignment_id, generate_group_id, generate_student_id};
pub use crate::generated::types::{
    Assignment, AssignmentId, AssignmentMetadata, AssignmentType, GitIdentityMode,
    GitUsernameStatus, Group, GroupId, GroupSetKind, Roster, RosterSource, Student, StudentId,
    StudentStatus, ValidationIssue, ValidationKind, ValidationResult,
};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StudentDraft {
    pub name: String,
    pub email: String,
    pub student_number: Option<String>,
    pub git_username: Option<String>,
    pub lms_user_id: Option<String>,
    pub status: Option<StudentStatus>,
    pub custom_fields: HashMap<String, String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GroupDraft {
    pub name: String,
    pub member_ids: Vec<StudentId>,
}

impl Roster {
    pub fn empty() -> Self {
        Self {
            source: None,
            students: Vec::new(),
            assignments: Vec::new(),
            lms_group_sets: Some(Vec::new()),
        }
    }
}

impl Student {
    pub fn new(draft: StudentDraft) -> Self {
        Self {
            id: generate_student_id(),
            name: draft.name,
            email: draft.email,
            student_number: draft.student_number,
            git_username: draft.git_username,
            git_username_status: GitUsernameStatus::default(),
            status: draft.status.unwrap_or_default(),
            lms_user_id: draft.lms_user_id,
            custom_fields: draft.custom_fields,
        }
    }
}

impl Assignment {
    pub fn new(name: impl Into<String>, group_set_id: Option<String>) -> Self {
        Self {
            id: generate_assignment_id(),
            name: name.into(),
            description: None,
            assignment_type: AssignmentType::default(),
            groups: Vec::new(),
            group_set_id,
        }
    }
}

impl Group {
    pub fn new(draft: GroupDraft) -> Self {
        Self {
            id: generate_group_id(),
            name: draft.name,
            member_ids: draft.member_ids,
        }
    }
}

impl StudentId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl AssignmentId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl GroupId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for StudentId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl fmt::Display for AssignmentId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl fmt::Display for GroupId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}
