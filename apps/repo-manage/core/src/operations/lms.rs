use crate::import::{normalize_email, normalize_group_name};
use crate::lms::create_lms_client;
use crate::roster::{AssignmentId, Group, GroupDraft, Roster, RosterSource, Student, StudentDraft};
use crate::{
    GroupFilter, GroupImportConfig, GroupImportSummary, ImportGroupsResult, ImportStudentsResult,
    ImportSummary, LmsGroup, LmsGroupSet, LmsIdConflict, LmsOperationContext, LmsVerifyResult,
};
use chrono::Utc;
use lms_common::LmsClient as LmsClientTrait;
use std::collections::{HashMap, HashSet};

use super::error::HandlerError;

pub async fn verify_connection(
    context: &LmsOperationContext,
) -> Result<LmsVerifyResult, HandlerError> {
    let client = create_lms_client(&context.connection)?;
    client.get_courses().await?;
    Ok(LmsVerifyResult {
        success: true,
        message: format!("Connected to {:?}", context.connection.lms_type),
        lms_type: Some(context.connection.lms_type),
    })
}

pub async fn import_students(
    context: &LmsOperationContext,
    existing_roster: Option<Roster>,
) -> Result<ImportStudentsResult, HandlerError> {
    let client = create_lms_client(&context.connection)?;
    let users = client.get_users(&context.course_id).await?;
    merge_lms_students(existing_roster, users, &context.connection)
}

pub async fn import_groups(
    context: &LmsOperationContext,
    roster: Roster,
    assignment_id: &AssignmentId,
    config: GroupImportConfig,
) -> Result<ImportGroupsResult, HandlerError> {
    let client = create_lms_client(&context.connection)?;
    let categories = client.get_group_categories(&context.course_id).await?;
    let category = categories
        .into_iter()
        .find(|category| category.id == config.group_set_id)
        .ok_or_else(|| HandlerError::not_found("Group set not found"))?;

    let groups = client
        .get_groups_for_category(&context.course_id, Some(&category.id))
        .await?;

    let mut lms_groups = Vec::new();
    for group in groups {
        let memberships = client.get_group_members(&group.id).await?;
        let member_ids = memberships
            .into_iter()
            .map(|membership| membership.user_id)
            .collect::<Vec<_>>();
        lms_groups.push(LmsGroup {
            id: group.id,
            name: group.name,
            member_ids,
        });
    }

    let (filtered_groups, filter_label) = apply_group_filter(&lms_groups, &config.filter)?;
    merge_lms_groups(
        roster,
        assignment_id,
        &config.group_set_id,
        filtered_groups,
        filter_label,
    )
}

pub async fn fetch_group_set_list(
    context: &LmsOperationContext,
) -> Result<Vec<LmsGroupSet>, HandlerError> {
    let client = create_lms_client(&context.connection)?;
    let categories = client.get_group_categories(&context.course_id).await?;

    Ok(categories
        .into_iter()
        .map(|category| LmsGroupSet {
            id: category.id,
            name: category.name,
            groups: vec![],
        })
        .collect())
}

pub async fn fetch_groups_for_set(
    context: &LmsOperationContext,
    group_set_id: &str,
) -> Result<Vec<LmsGroup>, HandlerError> {
    let client = create_lms_client(&context.connection)?;
    let groups = client
        .get_groups_for_category(&context.course_id, Some(group_set_id))
        .await?;

    let mut lms_groups = Vec::new();
    for group in groups {
        let memberships = client.get_group_members(&group.id).await?;
        let member_ids = memberships
            .into_iter()
            .map(|membership| membership.user_id)
            .collect::<Vec<_>>();
        lms_groups.push(LmsGroup {
            id: group.id,
            name: group.name,
            member_ids,
        });
    }

    Ok(lms_groups)
}

fn merge_lms_students(
    roster: Option<Roster>,
    users: Vec<crate::User>,
    connection: &crate::LmsConnection,
) -> Result<ImportStudentsResult, HandlerError> {
    let base_roster = roster.unwrap_or_else(Roster::empty);

    let missing_email_count = users
        .iter()
        .filter(|user| user.email.as_deref().unwrap_or("").trim().is_empty())
        .count();

    let mut lms_index: HashMap<String, usize> = HashMap::new();
    let mut email_index: HashMap<String, usize> = HashMap::new();
    for (idx, student) in base_roster.students.iter().enumerate() {
        if let Some(lms_id) = student.lms_user_id.as_ref() {
            lms_index.insert(lms_id.clone(), idx);
        }
        email_index.insert(normalize_email(&student.email), idx);
    }

    let mut conflicts = Vec::new();
    for user in &users {
        let email = normalize_email(user.email.as_deref().unwrap_or(""));
        let lms_user_id = user.id.clone();

        if lms_index.contains_key(&lms_user_id) {
            continue;
        }

        if !email.is_empty() {
            if let Some(&idx) = email_index.get(&email) {
                let student = &base_roster.students[idx];
                if let Some(existing_lms_id) = student.lms_user_id.as_ref() {
                    if existing_lms_id != &lms_user_id {
                        conflicts.push(LmsIdConflict {
                            email: email.clone(),
                            roster_lms_user_id: existing_lms_id.clone(),
                            incoming_lms_user_id: lms_user_id.clone(),
                            roster_student_name: student.name.clone(),
                            incoming_student_name: user.name.clone(),
                        });
                    }
                }
            }
        }
    }

    if !conflicts.is_empty() {
        let details = conflicts
            .iter()
            .map(|conflict| {
                format!(
                    "{} (roster: {}, incoming: {})",
                    conflict.email, conflict.roster_lms_user_id, conflict.incoming_lms_user_id
                )
            })
            .collect::<Vec<_>>()
            .join("; ");
        return Err(HandlerError::Validation(format!(
            "LMS ID conflicts detected: {}",
            details
        )));
    }

    let mut updated_roster = base_roster.clone();
    let mut lms_index: HashMap<String, usize> = HashMap::new();
    let mut email_index: HashMap<String, usize> = HashMap::new();
    for (idx, student) in updated_roster.students.iter().enumerate() {
        if let Some(lms_id) = student.lms_user_id.as_ref() {
            lms_index.insert(lms_id.clone(), idx);
        }
        email_index.insert(normalize_email(&student.email), idx);
    }

    let mut added = 0;
    let mut updated = 0;
    let mut unchanged = 0;

    for user in users {
        let email = normalize_email(user.email.as_deref().unwrap_or(""));
        let lms_user_id = user.id.clone();
        let student_number = user.login_id.clone();

        if let Some(&idx) = lms_index.get(&lms_user_id) {
            let student = &mut updated_roster.students[idx];
            let old_email = normalize_email(&student.email);
            let changed = update_student_from_lms(
                student,
                &user.name,
                &email,
                student_number.clone(),
                &lms_user_id,
            );
            if changed {
                updated += 1;
            } else {
                unchanged += 1;
            }
            if !email.is_empty() && email != old_email {
                email_index.insert(email.clone(), idx);
            }
            continue;
        }

        if !email.is_empty() {
            if let Some(&idx) = email_index.get(&email) {
                let student = &mut updated_roster.students[idx];
                let old_email = normalize_email(&student.email);

                let changed = update_student_from_lms(
                    student,
                    &user.name,
                    &email,
                    student_number.clone(),
                    &lms_user_id,
                );
                if changed {
                    updated += 1;
                } else {
                    unchanged += 1;
                }
                if email != old_email {
                    email_index.insert(email.clone(), idx);
                }
                lms_index.insert(lms_user_id.clone(), idx);
                continue;
            }
        }

        let draft = StudentDraft {
            name: user.name.clone(),
            email: email.clone(),
            student_number,
            git_username: None,
            lms_user_id: Some(lms_user_id.clone()),
            custom_fields: HashMap::new(),
        };
        let student = Student::new(draft);
        updated_roster.students.push(student);
        let idx = updated_roster.students.len() - 1;
        lms_index.insert(lms_user_id, idx);
        if !email.is_empty() {
            email_index.insert(email, idx);
        }
        added += 1;
    }

    updated_roster.source = Some(RosterSource {
        kind: "lms".to_string(),
        lms_type: Some(connection.lms_type),
        base_url: Some(connection.base_url.clone()),
        fetched_at: Some(Utc::now()),
        file_name: None,
        imported_at: None,
        created_at: None,
    });

    Ok(ImportStudentsResult {
        summary: ImportSummary {
            students_added: added as i64,
            students_updated: updated as i64,
            students_unchanged: unchanged as i64,
            students_missing_email: missing_email_count as i64,
        },
        roster: updated_roster,
    })
}

fn update_student_from_lms(
    student: &mut Student,
    name: &str,
    email: &str,
    student_number: Option<String>,
    lms_user_id: &str,
) -> bool {
    let mut changed = false;
    if student.name != name {
        student.name = name.to_string();
        changed = true;
    }
    if student.email != email {
        student.email = email.to_string();
        changed = true;
    }
    if student.student_number != student_number {
        student.student_number = student_number;
        changed = true;
    }
    if student.lms_user_id.as_deref() != Some(lms_user_id) {
        student.lms_user_id = Some(lms_user_id.to_string());
        changed = true;
    }
    changed
}

fn apply_group_filter(
    groups: &[LmsGroup],
    filter: &GroupFilter,
) -> Result<(Vec<LmsGroup>, String), HandlerError> {
    match filter.kind.as_str() {
        "all" => Ok((groups.to_vec(), "All".to_string())),
        "selected" => {
            let selected = filter.selected.clone().unwrap_or_default();
            let set: HashSet<String> = selected.iter().cloned().collect();
            let filtered = groups
                .iter()
                .filter(|group| set.contains(&group.id))
                .cloned()
                .collect::<Vec<_>>();
            Ok((filtered, format!("{} selected", selected.len())))
        }
        "pattern" => {
            let pattern = filter.pattern.clone().ok_or_else(|| {
                HandlerError::Validation("Pattern filter requires a pattern".into())
            })?;
            let glob = glob::Pattern::new(&pattern)
                .map_err(|e| HandlerError::Validation(format!("Invalid pattern: {}", e)))?;
            let filtered = groups
                .iter()
                .filter(|group| glob.matches(&group.name))
                .cloned()
                .collect::<Vec<_>>();
            Ok((filtered, format!("Pattern: {}", pattern)))
        }
        other => Err(HandlerError::Validation(format!(
            "Unknown filter kind: {}",
            other
        ))),
    }
}

fn merge_lms_groups(
    roster: Roster,
    assignment_id: &AssignmentId,
    group_set_id: &str,
    groups: Vec<LmsGroup>,
    filter_label: String,
) -> Result<ImportGroupsResult, HandlerError> {
    let mut updated_roster = roster.clone();
    let assignment = updated_roster
        .assignments
        .iter_mut()
        .find(|assignment| assignment.id == *assignment_id)
        .ok_or_else(|| HandlerError::not_found("Assignment not found"))?;

    let mut missing_members = Vec::new();
    let mut name_map: HashMap<String, Vec<String>> = HashMap::new();
    let mut lms_to_student: HashMap<String, crate::roster::StudentId> = HashMap::new();
    for student in &updated_roster.students {
        if let Some(lms_id) = student.lms_user_id.as_ref() {
            lms_to_student.insert(lms_id.clone(), student.id.clone());
        }
    }

    let mut new_groups = Vec::new();
    let mut students_referenced = 0;

    for group in groups {
        let normalized = normalize_group_name(&group.name);
        name_map
            .entry(normalized)
            .or_default()
            .push(group.name.clone());

        let mut member_ids: HashSet<crate::roster::StudentId> = HashSet::new();
        for member_id in group.member_ids {
            if let Some(student_id) = lms_to_student.get(&member_id) {
                member_ids.insert(student_id.clone());
            } else {
                missing_members.push(member_id);
            }
        }

        students_referenced += member_ids.len();

        let draft = GroupDraft {
            name: group.name,
            member_ids: member_ids.into_iter().collect(),
        };
        new_groups.push(Group::new(draft));
    }

    if !missing_members.is_empty() {
        let mut unique_missing: HashSet<String> = HashSet::new();
        for member in missing_members {
            unique_missing.insert(member);
        }
        let mut list = unique_missing.into_iter().collect::<Vec<_>>();
        list.sort();
        return Err(HandlerError::Validation(format!(
            "Unresolved LMS member IDs: {}",
            list.join(", ")
        )));
    }

    let mut duplicates = Vec::new();
    for (normalized, names) in name_map {
        if names.len() > 1 {
            duplicates.push(format!("{} ({})", normalized, names.join(", ")));
        }
    }
    if !duplicates.is_empty() {
        return Err(HandlerError::Validation(format!(
            "Duplicate group names detected: {}",
            duplicates.join("; ")
        )));
    }

    let groups_replaced = assignment.groups.len();
    assignment.groups = new_groups;
    assignment.lms_group_set_id = Some(group_set_id.to_string());

    Ok(ImportGroupsResult {
        summary: GroupImportSummary {
            groups_imported: assignment.groups.len() as i64,
            groups_replaced: groups_replaced as i64,
            students_referenced: students_referenced as i64,
            filter_applied: filter_label,
        },
        roster: updated_roster,
    })
}
