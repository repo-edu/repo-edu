//! Roster types and helpers.
//!
//! Re-exports generated types and provides builder utilities.

use std::fmt;

use super::nanoid::{generate_assignment_id, generate_group_id, generate_roster_member_id};
pub use crate::generated::types::{
    Assignment, AssignmentId, AssignmentMetadata, EnrollmentType, GitIdentityMode,
    GitUsernameStatus, Group, GroupSelectionMode, GroupSet, GroupSetConnection, MemberStatus,
    Roster, RosterConnection, RosterMember, RosterMemberId, ValidationIssue, ValidationKind,
    ValidationResult,
};

use super::resolution::selection_mode_all;

/// Draft for creating a new roster member.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RosterMemberDraft {
    pub name: String,
    pub email: String,
    pub student_number: Option<String>,
    pub git_username: Option<String>,
    pub lms_user_id: Option<String>,
    pub status: Option<MemberStatus>,
    pub enrollment_type: Option<EnrollmentType>,
    pub enrollment_display: Option<String>,
    pub department: Option<String>,
    pub institution: Option<String>,
    pub source: Option<String>,
}

/// Draft for creating a new group.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GroupDraft {
    pub name: String,
    pub member_ids: Vec<RosterMemberId>,
}

impl Roster {
    /// Create an empty roster with required fields.
    pub fn empty() -> Self {
        Self {
            connection: None,
            students: Vec::new(),
            staff: Vec::new(),
            groups: Vec::new(),
            group_sets: Vec::new(),
            assignments: Vec::new(),
        }
    }

    /// Find a roster member by ID across students and staff.
    pub fn find_member(&self, id: &RosterMemberId) -> Option<&RosterMember> {
        self.students
            .iter()
            .chain(self.staff.iter())
            .find(|m| &m.id == id)
    }

    /// Find a group by ID.
    pub fn find_group(&self, id: &str) -> Option<&Group> {
        self.groups.iter().find(|g| g.id == id)
    }

    /// Find a group set by ID.
    pub fn find_group_set(&self, id: &str) -> Option<&GroupSet> {
        self.group_sets.iter().find(|gs| gs.id == id)
    }

    /// Find an assignment by ID.
    pub fn find_assignment(&self, id: &AssignmentId) -> Option<&Assignment> {
        self.assignments.iter().find(|a| &a.id == id)
    }
}

impl RosterMember {
    /// Create a new roster member from a draft.
    pub fn new(draft: RosterMemberDraft) -> Self {
        Self {
            id: generate_roster_member_id(),
            name: draft.name,
            email: draft.email,
            student_number: draft.student_number,
            git_username: draft.git_username,
            git_username_status: GitUsernameStatus::default(),
            status: draft.status.unwrap_or_default(),
            lms_user_id: draft.lms_user_id,
            enrollment_type: draft.enrollment_type.unwrap_or_default(),
            enrollment_display: draft.enrollment_display,
            department: draft.department,
            institution: draft.institution,
            source: draft.source.unwrap_or_else(|| "local".to_string()),
        }
    }

    /// Check if this member is a student.
    pub fn is_student(&self) -> bool {
        self.enrollment_type == EnrollmentType::Student
    }

    /// Check if this member is active.
    pub fn is_active(&self) -> bool {
        self.status == MemberStatus::Active
    }
}

impl Assignment {
    /// Create a new assignment with a group set reference.
    pub fn new(name: impl Into<String>, group_set_id: String) -> Self {
        Self {
            id: generate_assignment_id(),
            name: name.into(),
            description: None,
            group_set_id,
            group_selection: selection_mode_all(),
        }
    }
}

impl Group {
    /// Create a new group from a draft.
    pub fn new(draft: GroupDraft) -> Self {
        Self {
            id: generate_group_id(),
            name: draft.name,
            member_ids: draft.member_ids,
            origin: "local".to_string(),
            lms_group_id: None,
        }
    }

    /// Check if this group is editable (origin == "local").
    pub fn is_editable(&self) -> bool {
        self.origin == "local"
    }
}

impl RosterMemberId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl AssignmentId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for RosterMemberId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl fmt::Display for AssignmentId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}
