use crate::error::{PlatformError, Result};
use crate::generated::types::{GroupFileImportResult, GroupFileImportSummary, GroupId};
use crate::import::{normalize_email, normalize_group_name, parse_group_edit_file, GroupEditEntry};
use crate::roster::{AssignmentId, Group, GroupDraft, Roster, StudentId};
use std::collections::{HashMap, HashSet};
use std::path::Path;

enum ImportMode {
    RoundTrip,
    FirstTime,
}

pub fn import_groups_from_file(
    roster: Roster,
    assignment_id: &AssignmentId,
    path: &Path,
) -> Result<GroupFileImportResult> {
    let entries = parse_group_edit_file(path)?;
    apply_group_edit_entries(roster, assignment_id, entries)
}

fn apply_group_edit_entries(
    roster: Roster,
    assignment_id: &AssignmentId,
    entries: Vec<GroupEditEntry>,
) -> Result<GroupFileImportResult> {
    let mut updated_roster = roster.clone();

    let mut id_to_student: HashMap<String, (StudentId, String)> = HashMap::new();
    let mut email_to_student: HashMap<String, (StudentId, String)> = HashMap::new();
    let mut duplicate_emails: HashSet<String> = HashSet::new();

    for student in &updated_roster.students {
        let student_id = student.id.clone();
        let email = student.email.clone();
        id_to_student.insert(
            student_id.as_str().to_string(),
            (student_id.clone(), email.clone()),
        );

        let normalized_email = normalize_email(&email);
        if let std::collections::hash_map::Entry::Vacant(entry) =
            email_to_student.entry(normalized_email.clone())
        {
            entry.insert((student_id, email));
        } else {
            duplicate_emails.insert(normalized_email);
        }
    }

    let mut errors = Vec::new();
    let mode = if entries.iter().any(|entry| entry.group_id.is_some()) {
        ImportMode::RoundTrip
    } else {
        ImportMode::FirstTime
    };

    let mut group_order: Vec<String> = Vec::new();
    let mut group_names: HashMap<String, String> = HashMap::new();
    let mut group_members: HashMap<String, Vec<StudentId>> = HashMap::new();
    let mut normalized_group_names: HashMap<String, String> = HashMap::new();
    let mut seen_students: HashMap<StudentId, String> = HashMap::new();

    for entry in entries {
        let group_name = entry.group_name.trim().to_string();
        let group_id = entry
            .group_id
            .as_ref()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let student_id_raw = entry
            .student_id
            .as_ref()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let student_email_raw = entry
            .student_email
            .as_ref()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        let (student_id, student_email) = if let Some(student_id) = student_id_raw.clone() {
            match id_to_student.get(&student_id) {
                Some((resolved_id, email)) => {
                    let email = email.clone();
                    (resolved_id.clone(), email)
                }
                None => {
                    errors.push(format!(
                        "Row {}: unknown student_id '{}'",
                        entry.row_number, student_id
                    ));
                    continue;
                }
            }
        } else {
            let email = match student_email_raw.as_ref() {
                Some(email) => email,
                None => {
                    errors.push(format!(
                        "Row {}: missing student_id or student_email",
                        entry.row_number
                    ));
                    continue;
                }
            };
            let normalized_email = normalize_email(email);
            if duplicate_emails.contains(&normalized_email) {
                errors.push(format!(
                    "Row {}: student_email '{}' matches multiple students",
                    entry.row_number, email
                ));
                continue;
            }
            match email_to_student.get(&normalized_email) {
                Some((resolved_id, resolved_email)) => {
                    (resolved_id.clone(), resolved_email.clone())
                }
                None => {
                    errors.push(format!(
                        "Row {}: unknown student_email '{}'",
                        entry.row_number, email
                    ));
                    continue;
                }
            }
        };

        if let Some(email) = student_email_raw.as_ref() {
            if normalize_email(email) != normalize_email(&student_email) {
                errors.push(format!(
                    "Row {}: student_email '{}' does not match student_id",
                    entry.row_number, email
                ));
                continue;
            }
        }

        let group_key = match mode {
            ImportMode::RoundTrip => match group_id.clone() {
                Some(group_id) => group_id,
                None => {
                    errors.push(format!(
                        "Row {}: missing group_id for round-trip import",
                        entry.row_number
                    ));
                    continue;
                }
            },
            ImportMode::FirstTime => group_name.clone(),
        };

        if let Some(existing_group) = seen_students.get(&student_id) {
            errors.push(format!(
                "Row {}: student appears in multiple groups ('{}' and '{}')",
                entry.row_number, existing_group, group_key
            ));
            continue;
        }
        seen_students.insert(student_id.clone(), group_key.clone());

        if matches!(mode, ImportMode::FirstTime) {
            let normalized = normalize_group_name(&group_name);
            if let Some(existing) = normalized_group_names.get(&normalized) {
                if existing != &group_name {
                    errors.push(format!(
                        "Row {}: group_name '{}' conflicts with '{}'",
                        entry.row_number, group_name, existing
                    ));
                    continue;
                }
            } else {
                normalized_group_names.insert(normalized, group_name.clone());
            }
        }

        match group_names.get(&group_key) {
            Some(existing_name) => {
                if existing_name != &group_name {
                    errors.push(format!(
                        "Row {}: group '{}' has conflicting names ('{}' vs '{}')",
                        entry.row_number, group_key, existing_name, group_name
                    ));
                    continue;
                }
            }
            None => {
                group_names.insert(group_key.clone(), group_name.clone());
                group_order.push(group_key.clone());
                group_members.insert(group_key.clone(), Vec::new());
            }
        }

        if let Some(members) = group_members.get_mut(&group_key) {
            members.push(student_id);
        }
    }

    if !errors.is_empty() {
        let message = errors.join("; ");
        return Err(PlatformError::Other(format!(
            "Group import failed: {}",
            message
        )));
    }

    let mut duplicates = Vec::new();
    let mut name_map: HashMap<String, Vec<String>> = HashMap::new();
    for group_id in &group_order {
        if let Some(name) = group_names.get(group_id) {
            let normalized = normalize_group_name(name);
            name_map.entry(normalized).or_default().push(name.clone());
        }
    }

    for (normalized, names) in name_map {
        if names.len() > 1 {
            duplicates.push(format!("{} ({})", normalized, names.join(", ")));
        }
    }

    if !duplicates.is_empty() {
        return Err(PlatformError::Other(format!(
            "Duplicate group names detected: {}",
            duplicates.join("; ")
        )));
    }

    let assignment = updated_roster
        .assignments
        .iter_mut()
        .find(|assignment| assignment.id == *assignment_id)
        .ok_or_else(|| PlatformError::Other("Assignment not found".to_string()))?;

    let mut new_groups = Vec::new();
    for group_key in group_order {
        let name = group_names
            .remove(&group_key)
            .ok_or_else(|| PlatformError::Other("Group name missing".to_string()))?;
        let members = group_members
            .remove(&group_key)
            .ok_or_else(|| PlatformError::Other("Group members missing".to_string()))?;

        let group = match mode {
            ImportMode::RoundTrip => Group {
                id: GroupId(group_key),
                name,
                member_ids: members,
            },
            ImportMode::FirstTime => Group::new(GroupDraft {
                name,
                member_ids: members,
            }),
        };
        new_groups.push(group);
    }

    let mut old_group_names: HashMap<String, String> = HashMap::new();
    let mut old_group_ids: HashSet<String> = HashSet::new();
    for group in &assignment.groups {
        old_group_ids.insert(group.id.as_str().to_string());
        old_group_names.insert(group.id.as_str().to_string(), group.name.clone());
    }

    let mut new_group_ids: HashSet<String> = HashSet::new();
    for group in &new_groups {
        new_group_ids.insert(group.id.as_str().to_string());
    }

    let groups_added = new_group_ids.difference(&old_group_ids).count() as i64;
    let groups_removed = old_group_ids.difference(&new_group_ids).count() as i64;

    let mut groups_renamed = 0;
    for group in &new_groups {
        let id = group.id.as_str();
        if let Some(old_name) = old_group_names.get(id) {
            if old_name != &group.name {
                groups_renamed += 1;
            }
        }
    }

    let mut old_member_groups: HashMap<StudentId, String> = HashMap::new();
    for group in &assignment.groups {
        for member_id in &group.member_ids {
            old_member_groups.insert(member_id.clone(), group.id.as_str().to_string());
        }
    }

    let mut new_member_groups: HashMap<StudentId, String> = HashMap::new();
    for group in &new_groups {
        for member_id in &group.member_ids {
            new_member_groups.insert(member_id.clone(), group.id.as_str().to_string());
        }
    }

    let members_added = new_member_groups
        .keys()
        .filter(|student_id| !old_member_groups.contains_key(*student_id))
        .count() as i64;
    let members_removed = old_member_groups
        .keys()
        .filter(|student_id| !new_member_groups.contains_key(*student_id))
        .count() as i64;
    let members_moved = new_member_groups
        .iter()
        .filter(|(student_id, group_id)| {
            old_member_groups
                .get(*student_id)
                .map(|old_group| old_group != *group_id)
                .unwrap_or(false)
        })
        .count() as i64;

    assignment.groups = new_groups;
    assignment.lms_group_set_id = None;

    Ok(GroupFileImportResult {
        summary: GroupFileImportSummary {
            groups_added,
            groups_removed,
            groups_renamed,
            members_added,
            members_removed,
            members_moved,
        },
        roster: updated_roster,
    })
}

#[cfg(test)]
mod tests {
    use super::{import_groups_from_file, GroupId};
    use crate::roster::{
        export_groups_for_edit, Assignment, AssignmentId, Group, Roster, Student, StudentDraft,
    };
    use tempfile::Builder;

    #[test]
    fn roundtrip_import_clears_lms_link() {
        let student_a = Student::new(StudentDraft {
            name: "Ada Lovelace".to_string(),
            email: "ada@example.com".to_string(),
            ..Default::default()
        });
        let student_b = Student::new(StudentDraft {
            name: "Grace Hopper".to_string(),
            email: "grace@example.com".to_string(),
            ..Default::default()
        });

        let assignment_id = AssignmentId("assignment-1".to_string());
        let group = Group {
            id: GroupId("group-1".to_string()),
            name: "Group One".to_string(),
            member_ids: vec![student_a.id.clone(), student_b.id.clone()],
        };
        let assignment = Assignment {
            id: assignment_id.clone(),
            name: "Lab 1".to_string(),
            description: None,
            groups: vec![group],
            lms_group_set_id: Some("lms-set-1".to_string()),
        };

        let roster = Roster {
            students: vec![student_a, student_b],
            assignments: vec![assignment],
            source: None,
        };

        let temp_path = Builder::new()
            .suffix(".csv")
            .tempfile()
            .unwrap()
            .into_temp_path();
        export_groups_for_edit(&roster, &assignment_id, temp_path.as_ref()).unwrap();

        let result =
            import_groups_from_file(roster.clone(), &assignment_id, temp_path.as_ref()).unwrap();
        let updated_assignment = result
            .roster
            .assignments
            .iter()
            .find(|assignment| assignment.id == assignment_id)
            .unwrap();

        assert_eq!(result.summary.groups_added, 0);
        assert_eq!(result.summary.groups_removed, 0);
        assert_eq!(result.summary.groups_renamed, 0);
        assert_eq!(result.summary.members_added, 0);
        assert_eq!(result.summary.members_removed, 0);
        assert_eq!(result.summary.members_moved, 0);
        assert_eq!(updated_assignment.lms_group_set_id, None);
        assert_eq!(updated_assignment.groups.len(), 1);
        assert_eq!(updated_assignment.groups[0].member_ids.len(), 2);
    }

    #[test]
    fn first_time_import_creates_groups() {
        let student_a = Student::new(StudentDraft {
            name: "Ada Lovelace".to_string(),
            email: "ada@example.com".to_string(),
            ..Default::default()
        });
        let student_b = Student::new(StudentDraft {
            name: "Grace Hopper".to_string(),
            email: "grace@example.com".to_string(),
            ..Default::default()
        });
        let student_c = Student::new(StudentDraft {
            name: "Alan Turing".to_string(),
            email: "alan@example.com".to_string(),
            ..Default::default()
        });

        let assignment_id = AssignmentId("assignment-1".to_string());
        let assignment = Assignment {
            id: assignment_id.clone(),
            name: "Lab 1".to_string(),
            description: None,
            groups: vec![],
            lms_group_set_id: Some("lms-set-1".to_string()),
        };

        let roster = Roster {
            students: vec![student_a.clone(), student_b.clone(), student_c.clone()],
            assignments: vec![assignment],
            source: None,
        };

        let csv = format!(
            "group_name,student_email\nTeam Alpha,{}\nTeam Alpha,{}\nTeam Beta,{}\n",
            student_a.email, student_b.email, student_c.email
        );
        let temp_path = Builder::new()
            .suffix(".csv")
            .tempfile()
            .unwrap()
            .into_temp_path();
        std::fs::write(temp_path.as_ref() as &std::path::Path, csv).unwrap();

        let result =
            import_groups_from_file(roster.clone(), &assignment_id, temp_path.as_ref()).unwrap();
        let updated_assignment = result
            .roster
            .assignments
            .iter()
            .find(|assignment| assignment.id == assignment_id)
            .unwrap();

        assert_eq!(result.summary.groups_added, 2);
        assert_eq!(result.summary.groups_removed, 0);
        assert_eq!(result.summary.groups_renamed, 0);
        assert_eq!(result.summary.members_added, 3);
        assert_eq!(result.summary.members_removed, 0);
        assert_eq!(result.summary.members_moved, 0);
        assert_eq!(updated_assignment.lms_group_set_id, None);
        assert_eq!(updated_assignment.groups.len(), 2);

        let mut names = updated_assignment
            .groups
            .iter()
            .map(|group| group.name.as_str())
            .collect::<Vec<_>>();
        names.sort();
        assert_eq!(names, vec!["Team Alpha", "Team Beta"]);
    }
}
