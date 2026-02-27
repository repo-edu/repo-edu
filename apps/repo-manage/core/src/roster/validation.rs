//! Roster and assignment validation.

use std::collections::{HashMap, HashSet};

use super::resolution::resolve_assignment_groups;
use super::slug::compute_repo_name;
use super::system::{system_sets_missing, ORIGIN_LMS, ORIGIN_LOCAL, ORIGIN_SYSTEM};
use super::types::{
    AssignmentId, EnrollmentType, GitIdentityMode, GitUsernameStatus, GroupSetConnection,
    MemberStatus, Roster, ValidationIssue, ValidationKind, ValidationResult,
};

const DEFAULT_REPO_TEMPLATE: &str = "{assignment}-{group}";

/// Validate the entire roster.
///
/// Checks for:
/// - Missing system group sets (must call ensure_system_group_sets first)
/// - Duplicate member IDs
/// - Missing/invalid emails
/// - Duplicate emails
/// - Duplicate assignment names
/// - Group reference integrity
/// - Enrollment type partitioning
pub fn validate_roster(roster: &Roster) -> ValidationResult {
    let mut issues = Vec::new();

    // Check system group sets exist
    if system_sets_missing(roster) {
        issues.push(ValidationIssue {
            kind: ValidationKind::SystemGroupSetsMissing,
            affected_ids: Vec::new(),
            context: Some("Call ensure_system_group_sets before validation".to_string()),
        });
    }

    // Check for duplicate member IDs across students and staff
    let all_member_ids: Vec<String> = roster
        .students
        .iter()
        .chain(roster.staff.iter())
        .map(|m| m.id.0.clone())
        .collect();
    let duplicate_member_ids = find_duplicate_strings(all_member_ids);
    if !duplicate_member_ids.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::DuplicateStudentId,
            affected_ids: duplicate_member_ids,
            context: None,
        });
    }

    // Check for missing emails (students only)
    let missing_emails: Vec<String> = roster
        .students
        .iter()
        .filter(|m| m.email.trim().is_empty())
        .map(|m| m.id.0.clone())
        .collect();
    if !missing_emails.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::MissingEmail,
            affected_ids: missing_emails,
            context: None,
        });
    }

    // Check for invalid email formats (non-empty emails only, students only)
    let invalid_emails: Vec<String> = roster
        .students
        .iter()
        .filter(|m| !m.email.trim().is_empty())
        .filter(|m| !is_valid_email(&m.email))
        .map(|m| m.id.0.clone())
        .collect();
    if !invalid_emails.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::InvalidEmail,
            affected_ids: invalid_emails,
            context: None,
        });
    }

    // Check for duplicate emails (students only, among non-empty emails)
    let duplicate_emails = find_duplicate_strings(
        roster
            .students
            .iter()
            .filter(|m| !m.email.trim().is_empty())
            .map(|m| normalize_email(&m.email)),
    );
    if !duplicate_emails.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::DuplicateEmail,
            affected_ids: duplicate_emails,
            context: None,
        });
    }

    // Check for duplicate assignment names
    let duplicate_assignments =
        find_duplicate_strings(roster.assignments.iter().map(|a| normalize_name(&a.name)));
    if !duplicate_assignments.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::DuplicateAssignmentName,
            affected_ids: duplicate_assignments,
            context: None,
        });
    }

    // Check for duplicate group IDs
    let duplicate_group_ids = find_duplicate_strings(roster.groups.iter().map(|g| g.id.clone()));
    if !duplicate_group_ids.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::DuplicateGroupIdInAssignment,
            affected_ids: duplicate_group_ids,
            context: Some("Duplicate group IDs in roster".to_string()),
        });
    }

    // Check that all group_ids in group sets reference existing groups
    let group_id_set: HashSet<&str> = roster.groups.iter().map(|g| g.id.as_str()).collect();
    for group_set in &roster.group_sets {
        let orphan_refs: Vec<String> = group_set
            .group_ids
            .iter()
            .filter(|id| !group_id_set.contains(id.as_str()))
            .cloned()
            .collect();
        if !orphan_refs.is_empty() {
            issues.push(ValidationIssue {
                kind: ValidationKind::OrphanGroupMember,
                affected_ids: orphan_refs,
                context: Some(format!(
                    "Group set '{}' references non-existent groups",
                    group_set.name
                )),
            });
        }
    }

    // Check enrollment type partitioning
    let misplaced_students: Vec<String> = roster
        .students
        .iter()
        .filter(|m| m.enrollment_type != EnrollmentType::Student)
        .map(|m| m.id.0.clone())
        .collect();
    if !misplaced_students.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::InvalidEnrollmentPartition,
            affected_ids: misplaced_students,
            context: Some("Non-students in students array".to_string()),
        });
    }

    let misplaced_staff: Vec<String> = roster
        .staff
        .iter()
        .filter(|m| m.enrollment_type == EnrollmentType::Student)
        .map(|m| m.id.0.clone())
        .collect();
    if !misplaced_staff.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::InvalidEnrollmentPartition,
            affected_ids: misplaced_staff,
            context: Some("Students in staff array".to_string()),
        });
    }

    // Check that all member_ids in groups reference existing roster members
    let member_id_set: HashSet<&str> = roster
        .students
        .iter()
        .chain(roster.staff.iter())
        .map(|m| m.id.0.as_str())
        .collect();
    for group in &roster.groups {
        let orphan_members: Vec<String> = group
            .member_ids
            .iter()
            .filter(|id| !member_id_set.contains(id.0.as_str()))
            .map(|id| id.0.clone())
            .collect();
        if !orphan_members.is_empty() {
            issues.push(ValidationIssue {
                kind: ValidationKind::OrphanGroupMember,
                affected_ids: orphan_members,
                context: Some(format!(
                    "Group '{}' references non-existent members",
                    group.name
                )),
            });
        }
    }

    // Validate group origin consistency in group sets
    for group_set in &roster.group_sets {
        validate_group_set_origin_consistency(roster, group_set, &mut issues);
    }

    ValidationResult { issues }
}

/// Validate origin consistency for a group set.
fn validate_group_set_origin_consistency(
    roster: &Roster,
    group_set: &super::types::GroupSet,
    issues: &mut Vec<ValidationIssue>,
) {
    for group_id in &group_set.group_ids {
        let Some(group) = roster.groups.iter().find(|g| &g.id == group_id) else {
            continue; // Already caught by orphan check
        };

        let origin_ok = match &group_set.connection {
            Some(GroupSetConnection::System { .. }) => group.origin == ORIGIN_SYSTEM,
            Some(GroupSetConnection::Canvas { .. } | GroupSetConnection::Moodle { .. }) => {
                group.origin == ORIGIN_LMS
            }
            Some(GroupSetConnection::Import { .. }) => {
                group.origin == ORIGIN_LOCAL && group.lms_group_id.is_none()
            }
            None => true, // Local sets can have mixed origins
        };

        if !origin_ok {
            issues.push(ValidationIssue {
                kind: ValidationKind::InvalidGroupOrigin,
                affected_ids: vec![group.id.clone()],
                context: Some(format!(
                    "Group '{}' has origin '{}' but group set '{}' expects different origin",
                    group.name, group.origin, group_set.name
                )),
            });
        }
    }
}

/// Validate a specific assignment.
pub fn validate_assignment(
    roster: &Roster,
    assignment_id: &AssignmentId,
    identity_mode: GitIdentityMode,
) -> ValidationResult {
    validate_assignment_with_template(roster, assignment_id, identity_mode, DEFAULT_REPO_TEMPLATE)
}

/// Validate a specific assignment with a custom repo name template.
pub fn validate_assignment_with_template(
    roster: &Roster,
    assignment_id: &AssignmentId,
    identity_mode: GitIdentityMode,
    template: &str,
) -> ValidationResult {
    let mut issues = Vec::new();

    let Some(assignment) = roster.find_assignment(assignment_id) else {
        return ValidationResult { issues };
    };

    // Resolve groups for this assignment
    let groups = resolve_assignment_groups(roster, assignment);

    // Build member lookup
    let member_lookup: HashMap<&str, &super::types::RosterMember> = roster
        .students
        .iter()
        .chain(roster.staff.iter())
        .map(|m| (m.id.0.as_str(), m))
        .collect();

    // Check for duplicate group names
    let duplicate_group_names =
        find_duplicate_strings(groups.iter().map(|g| normalize_name(&g.name)));
    if !duplicate_group_names.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::DuplicateGroupNameInAssignment,
            affected_ids: duplicate_group_names,
            context: None,
        });
    }

    let mut member_group_counts: HashMap<String, usize> = HashMap::new();
    let mut empty_groups: HashSet<String> = HashSet::new();
    let mut missing_git_usernames: HashSet<String> = HashSet::new();
    let mut invalid_git_usernames: HashSet<String> = HashSet::new();
    let mut assigned_active_students: HashSet<String> = HashSet::new();

    for group in &groups {
        if group.member_ids.is_empty() {
            empty_groups.insert(group.id.clone());
        }

        for member_id in &group.member_ids {
            let member_key = member_id.0.as_str();
            let Some(member) = member_lookup.get(member_key) else {
                // Member not found - already caught by roster validation
                continue;
            };

            if member.status != MemberStatus::Active {
                continue;
            }

            assigned_active_students.insert(member_key.to_string());
            *member_group_counts
                .entry(member_key.to_string())
                .or_insert(0) += 1;

            if identity_mode == GitIdentityMode::Username {
                let username = member.git_username.as_deref().map(str::trim);
                if username.is_none() || username == Some("") {
                    missing_git_usernames.insert(member_id.0.clone());
                } else if matches!(member.git_username_status, GitUsernameStatus::Invalid) {
                    invalid_git_usernames.insert(member_id.0.clone());
                }
            }
        }
    }

    // Check for members in multiple groups
    let duplicate_members: Vec<String> = member_group_counts
        .iter()
        .filter(|(_, count)| **count > 1)
        .map(|(id, _)| id.clone())
        .collect();
    if !duplicate_members.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::StudentInMultipleGroupsInAssignment,
            affected_ids: sorted_strings(duplicate_members),
            context: None,
        });
    }

    // Empty groups warning
    if !empty_groups.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::EmptyGroup,
            affected_ids: sorted_strings(empty_groups.into_iter().collect()),
            context: None,
        });
    }

    // Git username issues
    if identity_mode == GitIdentityMode::Username && !missing_git_usernames.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::MissingGitUsername,
            affected_ids: sorted_strings(missing_git_usernames.into_iter().collect()),
            context: None,
        });
    }

    if identity_mode == GitIdentityMode::Username && !invalid_git_usernames.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::InvalidGitUsername,
            affected_ids: sorted_strings(invalid_git_usernames.into_iter().collect()),
            context: None,
        });
    }

    // Check for unassigned active students (warning)
    let unassigned_active: Vec<String> = roster
        .students
        .iter()
        .filter(|m| m.status == MemberStatus::Active)
        .filter(|m| !assigned_active_students.contains(&m.id.0))
        .map(|m| m.id.0.clone())
        .collect();
    if !unassigned_active.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::UnassignedStudent,
            affected_ids: sorted_strings(unassigned_active),
            context: None,
        });
    }

    // Check for duplicate repo names
    let mut repo_name_map: HashMap<String, Vec<String>> = HashMap::new();
    for group in &groups {
        let repo_name = compute_repo_name(template, assignment, group);
        repo_name_map
            .entry(repo_name)
            .or_default()
            .push(group.id.clone());
    }

    for (repo_name, group_ids) in repo_name_map {
        if group_ids.len() > 1 {
            issues.push(ValidationIssue {
                kind: ValidationKind::DuplicateRepoNameInAssignment,
                affected_ids: sorted_strings(group_ids),
                context: Some(repo_name),
            });
        }
    }

    ValidationResult { issues }
}

impl ValidationResult {
    pub fn has_blocking_issues(&self) -> bool {
        self.issues.iter().any(|issue| issue.kind.is_blocking())
    }

    pub fn blocking_issues(&self) -> Vec<&ValidationIssue> {
        self.issues
            .iter()
            .filter(|issue| issue.kind.is_blocking())
            .collect()
    }

    pub fn warnings(&self) -> Vec<&ValidationIssue> {
        self.issues
            .iter()
            .filter(|issue| !issue.kind.is_blocking())
            .collect()
    }
}

impl ValidationKind {
    pub fn is_blocking(&self) -> bool {
        matches!(
            self,
            Self::DuplicateStudentId
                | Self::DuplicateEmail
                | Self::InvalidEmail
                | Self::DuplicateAssignmentName
                | Self::DuplicateGroupIdInAssignment
                | Self::DuplicateGroupNameInAssignment
                | Self::DuplicateRepoNameInAssignment
                | Self::OrphanGroupMember
                | Self::EmptyGroup
                | Self::SystemGroupSetsMissing
                | Self::InvalidEnrollmentPartition
                | Self::InvalidGroupOrigin
        )
        // Note: MissingEmail, MissingGitUsername, InvalidGitUsername, UnassignedStudent are warnings
    }
}

fn is_valid_email(email: &str) -> bool {
    let email = email.trim();
    let mut parts = email.split('@');
    let local = match parts.next() {
        Some(part) if !part.is_empty() => part,
        _ => return false,
    };
    let domain = match parts.next() {
        Some(part) if !part.is_empty() => part,
        _ => return false,
    };
    if parts.next().is_some() {
        return false;
    }
    let dot_index = domain.rfind('.');
    dot_index.is_some_and(|idx| idx > 0 && idx < domain.len() - 1) && !local.contains(' ')
}

fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

fn normalize_name(name: &str) -> String {
    name.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_lowercase()
}

fn find_duplicate_strings<I>(values: I) -> Vec<String>
where
    I: IntoIterator<Item = String>,
{
    let mut seen = HashSet::new();
    let mut duplicates = HashSet::new();

    for value in values {
        if !seen.insert(value.clone()) {
            duplicates.insert(value);
        }
    }

    sorted_strings(duplicates.into_iter().collect())
}

fn sorted_strings(mut values: Vec<String>) -> Vec<String> {
    values.sort();
    values
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generated::types::RosterMemberId;
    use crate::roster::system::ensure_system_group_sets;
    use crate::roster::types::RosterMember;

    fn make_student(id: &str, email: &str) -> RosterMember {
        RosterMember {
            id: RosterMemberId(id.to_string()),
            name: format!("Student {id}"),
            email: email.to_string(),
            student_number: None,
            git_username: None,
            git_username_status: GitUsernameStatus::Unknown,
            status: MemberStatus::Active,
            lms_status: None,
            lms_user_id: None,
            enrollment_type: EnrollmentType::Student,
            enrollment_display: None,
            department: None,
            institution: None,
            source: "local".to_string(),
        }
    }

    fn empty_roster() -> Roster {
        Roster {
            connection: None,
            students: Vec::new(),
            staff: Vec::new(),
            groups: Vec::new(),
            group_sets: Vec::new(),
            assignments: Vec::new(),
        }
    }

    #[test]
    fn validate_roster_detects_missing_system_sets() {
        let roster = empty_roster();
        let result = validate_roster(&roster);

        assert!(result
            .issues
            .iter()
            .any(|i| i.kind == ValidationKind::SystemGroupSetsMissing));
    }

    #[test]
    fn validate_roster_passes_with_system_sets() {
        let mut roster = empty_roster();
        ensure_system_group_sets(&mut roster);

        let result = validate_roster(&roster);
        assert!(!result
            .issues
            .iter()
            .any(|i| i.kind == ValidationKind::SystemGroupSetsMissing));
    }

    #[test]
    fn validate_roster_detects_duplicate_ids_and_emails() {
        let mut roster = empty_roster();
        roster.students.push(make_student("dup", "dup@example.com"));
        roster.students.push(make_student("dup", "dup@example.com"));
        ensure_system_group_sets(&mut roster);

        let result = validate_roster(&roster);
        assert!(result
            .issues
            .iter()
            .any(|i| i.kind == ValidationKind::DuplicateStudentId));
        assert!(result
            .issues
            .iter()
            .any(|i| i.kind == ValidationKind::DuplicateEmail));
    }

    #[test]
    fn validate_roster_detects_invalid_enrollment_partition() {
        let mut roster = empty_roster();
        let mut teacher_in_students = make_student("t1", "t1@example.com");
        teacher_in_students.enrollment_type = EnrollmentType::Teacher;
        roster.students.push(teacher_in_students);
        ensure_system_group_sets(&mut roster);

        let result = validate_roster(&roster);
        assert!(result
            .issues
            .iter()
            .any(|i| i.kind == ValidationKind::InvalidEnrollmentPartition));
    }

    #[test]
    fn validation_kind_is_blocking() {
        assert!(ValidationKind::DuplicateEmail.is_blocking());
        assert!(ValidationKind::EmptyGroup.is_blocking());
        assert!(ValidationKind::SystemGroupSetsMissing.is_blocking());
        assert!(!ValidationKind::UnassignedStudent.is_blocking());
    }
}
