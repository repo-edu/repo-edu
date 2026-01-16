use std::collections::{HashMap, HashSet};

use super::slug::compute_repo_name;
use super::types::{
    AssignmentId, AssignmentType, GitIdentityMode, GitUsernameStatus, GroupId, Roster,
    StudentStatus, ValidationIssue, ValidationKind, ValidationResult,
};

const DEFAULT_REPO_TEMPLATE: &str = "{assignment}-{group}";

pub fn validate_roster(roster: &Roster) -> ValidationResult {
    let mut issues = Vec::new();

    let duplicate_student_ids =
        find_duplicate_strings(roster.students.iter().map(|student| student.id.to_string()));
    if !duplicate_student_ids.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::DuplicateStudentId,
            affected_ids: duplicate_student_ids,
            context: None,
        });
    }

    // Check for missing emails
    let missing_emails: Vec<String> = roster
        .students
        .iter()
        .filter(|student| student.email.trim().is_empty())
        .map(|student| student.id.to_string())
        .collect();
    if !missing_emails.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::MissingEmail,
            affected_ids: missing_emails,
            context: None,
        });
    }

    // Check for invalid email formats (non-empty emails only)
    let invalid_emails: Vec<String> = roster
        .students
        .iter()
        .filter(|student| !student.email.trim().is_empty())
        .filter(|student| !is_valid_email(&student.email))
        .map(|student| student.id.to_string())
        .collect();
    if !invalid_emails.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::InvalidEmail,
            affected_ids: invalid_emails,
            context: None,
        });
    }

    // Only check for duplicate emails among students that have emails
    let duplicate_emails = find_duplicate_strings(
        roster
            .students
            .iter()
            .filter(|student| !student.email.trim().is_empty())
            .map(|student| normalize_email(&student.email)),
    );
    if !duplicate_emails.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::DuplicateEmail,
            affected_ids: duplicate_emails,
            context: None,
        });
    }

    let duplicate_assignments = find_duplicate_strings(
        roster
            .assignments
            .iter()
            .map(|assignment| normalize_name(&assignment.name)),
    );
    if !duplicate_assignments.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::DuplicateAssignmentName,
            affected_ids: duplicate_assignments,
            context: None,
        });
    }

    ValidationResult { issues }
}

pub fn validate_assignment(
    roster: &Roster,
    assignment_id: &AssignmentId,
    identity_mode: GitIdentityMode,
) -> ValidationResult {
    validate_assignment_with_template(roster, assignment_id, identity_mode, DEFAULT_REPO_TEMPLATE)
}

pub fn validate_assignment_with_template(
    roster: &Roster,
    assignment_id: &AssignmentId,
    identity_mode: GitIdentityMode,
    template: &str,
) -> ValidationResult {
    let mut issues = Vec::new();
    let Some(assignment) = roster
        .assignments
        .iter()
        .find(|assignment| &assignment.id == assignment_id)
    else {
        return ValidationResult { issues };
    };

    let student_lookup = roster
        .students
        .iter()
        .map(|student| (student.id.to_string(), student))
        .collect::<HashMap<_, _>>();

    let duplicate_group_ids =
        find_duplicate_strings(assignment.groups.iter().map(|group| group.id.to_string()));
    if !duplicate_group_ids.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::DuplicateGroupIdInAssignment,
            affected_ids: duplicate_group_ids,
            context: None,
        });
    }

    let duplicate_group_names = find_duplicate_strings(
        assignment
            .groups
            .iter()
            .map(|group| normalize_name(&group.name)),
    );
    if !duplicate_group_names.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::DuplicateGroupNameInAssignment,
            affected_ids: duplicate_group_names,
            context: None,
        });
    }

    let mut student_group_counts: HashMap<String, usize> = HashMap::new();
    let mut orphan_members: HashSet<String> = HashSet::new();
    let mut empty_groups: HashSet<String> = HashSet::new();
    let mut missing_git_usernames: HashSet<String> = HashSet::new();
    let mut invalid_git_usernames: HashSet<String> = HashSet::new();
    let mut assigned_active_students: HashSet<String> = HashSet::new();

    for group in &assignment.groups {
        if group.member_ids.is_empty() {
            empty_groups.insert(group.id.to_string());
        }
        for member_id in &group.member_ids {
            let member_key = member_id.to_string();
            let Some(student) = student_lookup.get(&member_key) else {
                orphan_members.insert(member_key);
                continue;
            };
            if student.status != StudentStatus::Active {
                continue;
            }
            assigned_active_students.insert(member_key.clone());
            *student_group_counts.entry(member_key.clone()).or_insert(0) += 1;
            if identity_mode == GitIdentityMode::Username {
                let username = student.git_username.as_deref().map(str::trim);
                if username.is_none() || username == Some("") {
                    missing_git_usernames.insert(student.id.to_string());
                } else if matches!(student.git_username_status, GitUsernameStatus::Invalid) {
                    invalid_git_usernames.insert(student.id.to_string());
                }
            }
        }
    }

    let duplicate_members = student_group_counts
        .iter()
        .filter(|(_, count)| **count > 1)
        .map(|(id, _)| id.clone())
        .collect::<Vec<_>>();
    if !duplicate_members.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::StudentInMultipleGroupsInAssignment,
            affected_ids: sorted_strings(duplicate_members),
            context: None,
        });
    }

    if !orphan_members.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::OrphanGroupMember,
            affected_ids: sorted_strings(orphan_members.into_iter().collect()),
            context: None,
        });
    }

    if !empty_groups.is_empty() {
        issues.push(ValidationIssue {
            kind: ValidationKind::EmptyGroup,
            affected_ids: sorted_strings(empty_groups.into_iter().collect()),
            context: None,
        });
    }

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

    if assignment.assignment_type == AssignmentType::ClassWide {
        let unassigned_active = roster
            .students
            .iter()
            .filter(|student| student.status == StudentStatus::Active)
            .filter(|student| !assigned_active_students.contains(&student.id.to_string()))
            .map(|student| student.id.to_string())
            .collect::<Vec<_>>();
        if !unassigned_active.is_empty() {
            issues.push(ValidationIssue {
                kind: ValidationKind::UnassignedStudent,
                affected_ids: sorted_strings(unassigned_active),
                context: None,
            });
        }
    }

    let mut repo_name_map: HashMap<String, Vec<GroupId>> = HashMap::new();
    for group in &assignment.groups {
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
                affected_ids: sorted_strings(group_ids.iter().map(ToString::to_string).collect()),
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
                | Self::UnassignedStudent
        )
        // Note: MissingEmail, MissingGitUsername, InvalidGitUsername are warnings (non-blocking)
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
    use std::collections::HashMap;

    use super::{validate_assignment, validate_roster};
    use crate::roster::types::{
        Assignment, AssignmentId, AssignmentType, GitIdentityMode, GitUsernameStatus, Group,
        GroupId, Roster, Student, StudentId, StudentStatus,
    };

    fn build_student(id: &str, email: &str) -> Student {
        Student {
            id: StudentId(id.to_string()),
            name: format!("Student {id}"),
            email: email.to_string(),
            student_number: None,
            git_username: None,
            git_username_status: GitUsernameStatus::Unknown,
            status: StudentStatus::Active,
            lms_user_id: None,
            custom_fields: HashMap::new(),
        }
    }

    #[test]
    fn validate_roster_detects_duplicate_ids_and_emails() {
        let roster = Roster {
            source: None,
            students: vec![
                build_student("dup", "dup@example.com"),
                build_student("dup", "dup@example.com"),
            ],
            assignments: vec![],
        };

        let result = validate_roster(&roster);
        assert!(result
            .issues
            .iter()
            .any(|issue| issue.kind == super::ValidationKind::DuplicateStudentId));
        assert!(result
            .issues
            .iter()
            .any(|issue| issue.kind == super::ValidationKind::DuplicateEmail));
    }

    #[test]
    fn validate_assignment_detects_duplicate_group_names_and_orphans() {
        let student = build_student("s1", "s1@example.com");
        let roster = Roster {
            source: None,
            students: vec![student],
            assignments: vec![Assignment {
                id: AssignmentId("a1".to_string()),
                name: "Assignment".to_string(),
                description: None,
                assignment_type: AssignmentType::ClassWide,
                groups: vec![
                    Group {
                        id: GroupId("g1".to_string()),
                        name: "Group".to_string(),
                        member_ids: vec![StudentId("missing".to_string())],
                    },
                    Group {
                        id: GroupId("g2".to_string()),
                        name: "Group".to_string(),
                        member_ids: vec![StudentId("s1".to_string())],
                    },
                ],
                lms_group_set_id: None,
            }],
        };

        let result = validate_assignment(
            &roster,
            &AssignmentId("a1".to_string()),
            GitIdentityMode::Username,
        );
        assert!(result
            .issues
            .iter()
            .any(|issue| issue.kind == super::ValidationKind::DuplicateGroupNameInAssignment));
        assert!(result
            .issues
            .iter()
            .any(|issue| issue.kind == super::ValidationKind::OrphanGroupMember));
    }

    #[test]
    fn validation_kind_is_blocking() {
        assert!(super::ValidationKind::DuplicateEmail.is_blocking());
        assert!(super::ValidationKind::EmptyGroup.is_blocking());
    }
}
