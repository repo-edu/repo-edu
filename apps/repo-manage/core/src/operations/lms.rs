use crate::context;
use crate::generated::types::{CachedLmsGroup, GroupSetOrigin, LmsGroupSetCacheEntry};
use crate::import::{normalize_email, normalize_group_name};
use crate::lms::create_lms_client;
use crate::roster::{
    AssignmentId, Group, GroupDraft, Roster, RosterSource, Student, StudentDraft, StudentId,
};
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
    // Use validate_token (fetches current user) instead of get_courses for efficiency
    client.validate_token().await?;
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

    // Fetch group set details (name and all groups with members)
    let (group_set_name, lms_groups) =
        fetch_group_set_details(&client, &context.course_id, &config.group_set_id).await?;

    // Cache the full group set (all groups, not filtered)
    let mut updated_roster = roster;
    let context_key = context::normalize_context(
        context.connection.lms_type,
        &context.connection.base_url,
        &context.course_id,
    );
    let cached_groups = build_cached_groups(&updated_roster, lms_groups.clone());
    let fetched_at = Utc::now();
    let entry = LmsGroupSetCacheEntry {
        id: config.group_set_id.clone(),
        origin: GroupSetOrigin::Lms,
        name: group_set_name,
        groups: cached_groups,
        fetched_at: Some(fetched_at),
        lms_group_set_id: Some(config.group_set_id.clone()),
        lms_type: context_key.lms_type,
        base_url: context_key.base_url,
        course_id: context_key.course_id,
    };
    upsert_cache_entry(&mut updated_roster, entry);

    // Apply filtered groups to the assignment
    let (filtered_groups, filter_label) = apply_group_filter(&lms_groups, &config.filter)?;
    merge_lms_groups_with_cache_timestamp(
        updated_roster,
        assignment_id,
        &config.group_set_id,
        filtered_groups,
        filter_label,
        fetched_at,
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

pub async fn cache_group_set(
    context: &LmsOperationContext,
    roster: Option<Roster>,
    group_set_id: &str,
) -> Result<Roster, HandlerError> {
    let client = create_lms_client(&context.connection)?;
    let (group_set_name, groups) =
        fetch_group_set_details(&client, &context.course_id, group_set_id).await?;

    let mut updated_roster = roster.unwrap_or_else(Roster::empty);
    let context_key = context::normalize_context(
        context.connection.lms_type,
        &context.connection.base_url,
        &context.course_id,
    );
    let cached_groups = build_cached_groups(&updated_roster, groups);
    let entry = LmsGroupSetCacheEntry {
        id: group_set_id.to_string(),
        origin: GroupSetOrigin::Lms,
        name: group_set_name,
        groups: cached_groups,
        fetched_at: Some(Utc::now()),
        lms_group_set_id: Some(group_set_id.to_string()),
        lms_type: context_key.lms_type,
        base_url: context_key.base_url,
        course_id: context_key.course_id,
    };

    upsert_cache_entry(&mut updated_roster, entry);
    Ok(updated_roster)
}

pub async fn refresh_cached_group_set(
    context: &LmsOperationContext,
    roster: Roster,
    group_set_id: &str,
) -> Result<Roster, HandlerError> {
    let entry = roster
        .lms_group_sets
        .as_ref()
        .and_then(|entries| entries.iter().find(|entry| entry.id == group_set_id))
        .ok_or_else(|| HandlerError::not_found("Cached group set not found"))?;

    if entry.origin != GroupSetOrigin::Lms {
        return Err(HandlerError::Validation("Cached group set is local".into()));
    }

    let lms_group_set_id = entry
        .lms_group_set_id
        .clone()
        .unwrap_or_else(|| entry.id.clone());
    let refreshed = cache_group_set(context, Some(roster), &lms_group_set_id).await?;
    Ok(refreshed)
}

pub async fn recache_group_set_for_assignment(
    context: &LmsOperationContext,
    roster: Roster,
    assignment_id: &AssignmentId,
) -> Result<Roster, HandlerError> {
    let group_set_id = roster
        .assignments
        .iter()
        .find(|assignment| assignment.id == *assignment_id)
        .and_then(|assignment| assignment.group_set_cache_id.clone())
        .ok_or_else(|| HandlerError::not_found("Assignment has no group set source"))?;

    let group_set_id = roster
        .lms_group_sets
        .as_ref()
        .and_then(|entries| entries.iter().find(|entry| entry.id == group_set_id))
        .map(|entry| {
            if entry.origin != GroupSetOrigin::Lms {
                return Err(HandlerError::Validation(
                    "Assignment group set is local".into(),
                ));
            }
            Ok(entry
                .lms_group_set_id
                .clone()
                .unwrap_or_else(|| entry.id.clone()))
        })
        .transpose()?
        .unwrap_or(group_set_id);

    cache_group_set(context, Some(roster), &group_set_id).await
}

pub fn delete_cached_group_set(roster: Roster, group_set_id: &str) -> Result<Roster, HandlerError> {
    let mut updated_roster = roster;
    if let Some(group_sets) = updated_roster.lms_group_sets.as_mut() {
        group_sets.retain(|entry| entry.id != group_set_id);
    }
    Ok(updated_roster)
}

pub fn list_cached_group_sets(roster: &Roster) -> Vec<LmsGroupSetCacheEntry> {
    roster.lms_group_sets.clone().unwrap_or_default()
}

pub fn detach_assignment_source(
    roster: Roster,
    assignment_id: &AssignmentId,
) -> Result<Roster, HandlerError> {
    let mut updated_roster = roster;
    let assignment = updated_roster
        .assignments
        .iter_mut()
        .find(|assignment| assignment.id == *assignment_id)
        .ok_or_else(|| HandlerError::not_found("Assignment not found"))?;

    assignment.group_set_cache_id = None;
    assignment.source_fetched_at = None;
    Ok(updated_roster)
}

pub fn apply_cached_group_set_to_assignment(
    roster: Roster,
    assignment_id: &AssignmentId,
    config: GroupImportConfig,
) -> Result<ImportGroupsResult, HandlerError> {
    let mut updated_roster = roster;
    let cached_entry = updated_roster
        .lms_group_sets
        .as_ref()
        .and_then(|entries| entries.iter().find(|entry| entry.id == config.group_set_id))
        .cloned()
        .ok_or_else(|| HandlerError::not_found("Cached group set not found"))?;

    let assignment = updated_roster
        .assignments
        .iter_mut()
        .find(|assignment| assignment.id == *assignment_id)
        .ok_or_else(|| HandlerError::not_found("Assignment not found"))?;

    let groups_replaced = assignment.groups.len();
    let mut students_referenced = 0usize;
    let mut new_groups = Vec::new();
    let (filtered_groups, filter_label) =
        apply_cached_group_filter(&cached_entry.groups, &config.filter)?;

    for cached_group in &filtered_groups {
        let member_ids = cached_group.resolved_member_ids.clone();
        students_referenced += member_ids.len();
        let draft = GroupDraft {
            name: cached_group.name.clone(),
            member_ids,
        };
        new_groups.push(Group::new(draft));
    }

    assignment.groups = new_groups;
    assignment.group_set_cache_id = Some(cached_entry.id.clone());
    assignment.source_fetched_at = cached_entry
        .fetched_at
        .as_ref()
        .map(chrono::DateTime::to_rfc3339);

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
    let mut lms_id_changed = false;

    for user in users {
        let email = normalize_email(user.email.as_deref().unwrap_or(""));
        let lms_user_id = user.id.clone();
        let student_number = user.login_id.clone();

        if let Some(&idx) = lms_index.get(&lms_user_id) {
            let student = &mut updated_roster.students[idx];
            let old_email = normalize_email(&student.email);
            let old_lms_id = student.lms_user_id.clone();
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
            if student.lms_user_id != old_lms_id {
                lms_id_changed = true;
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

                let old_lms_id = student.lms_user_id.clone();
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
                if student.lms_user_id != old_lms_id {
                    lms_id_changed = true;
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
            status: None,
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

    if lms_id_changed {
        mark_cache_for_reresolution(&mut updated_roster);
    }
    reresolve_cached_groups_if_needed(&mut updated_roster);

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

fn apply_cached_group_filter(
    groups: &[CachedLmsGroup],
    filter: &GroupFilter,
) -> Result<(Vec<CachedLmsGroup>, String), HandlerError> {
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

/// Merge LMS groups into an assignment, using the provided timestamp for source_fetched_at.
/// Used when importing groups after caching, to keep timestamps consistent.
fn merge_lms_groups_with_cache_timestamp(
    roster: Roster,
    assignment_id: &AssignmentId,
    group_set_id: &str,
    groups: Vec<LmsGroup>,
    filter_label: String,
    fetched_at: chrono::DateTime<Utc>,
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
    assignment.group_set_cache_id = Some(group_set_id.to_string());
    assignment.source_fetched_at = Some(fetched_at.to_rfc3339());

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

async fn fetch_group_set_details(
    client: &lms_client::LmsClient,
    course_id: &str,
    group_set_id: &str,
) -> Result<(String, Vec<LmsGroup>), HandlerError> {
    let categories = client.get_group_categories(course_id).await?;
    let category = categories
        .into_iter()
        .find(|category| category.id == group_set_id)
        .ok_or_else(|| HandlerError::not_found("Group set not found"))?;

    let groups = fetch_groups_for_set_with_members(client, course_id, group_set_id).await?;
    Ok((category.name, groups))
}

async fn fetch_groups_for_set_with_members(
    client: &lms_client::LmsClient,
    course_id: &str,
    group_set_id: &str,
) -> Result<Vec<LmsGroup>, HandlerError> {
    let groups = client
        .get_groups_for_category(course_id, Some(group_set_id))
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

fn upsert_cache_entry(roster: &mut Roster, entry: LmsGroupSetCacheEntry) {
    let group_sets = roster.lms_group_sets.get_or_insert_with(Vec::new);
    if let Some(existing) = group_sets.iter_mut().find(|set| set.id == entry.id) {
        *existing = entry;
    } else {
        group_sets.push(entry);
    }
}

fn build_cached_groups(roster: &Roster, groups: Vec<LmsGroup>) -> Vec<CachedLmsGroup> {
    let lms_to_student = build_lms_student_map(roster);
    groups
        .into_iter()
        .map(|group| {
            let (resolved_member_ids, unresolved_count) =
                resolve_member_ids(&lms_to_student, &group.member_ids);
            CachedLmsGroup {
                id: group.id,
                name: group.name,
                lms_member_ids: group.member_ids,
                resolved_member_ids,
                unresolved_count: unresolved_count as i64,
                needs_reresolution: false,
            }
        })
        .collect()
}

fn build_lms_student_map(roster: &Roster) -> HashMap<String, StudentId> {
    let mut map = HashMap::new();
    for student in &roster.students {
        if let Some(lms_id) = student.lms_user_id.as_ref() {
            map.insert(lms_id.clone(), student.id.clone());
        }
    }
    map
}

fn resolve_member_ids(
    lms_to_student: &HashMap<String, StudentId>,
    lms_member_ids: &[String],
) -> (Vec<StudentId>, usize) {
    let mut resolved = Vec::new();
    let mut seen = HashSet::new();
    let mut unresolved = 0;
    for member_id in lms_member_ids {
        if let Some(student_id) = lms_to_student.get(member_id) {
            if seen.insert(student_id.clone()) {
                resolved.push(student_id.clone());
            }
        } else {
            unresolved += 1;
        }
    }
    (resolved, unresolved)
}

fn mark_cache_for_reresolution(roster: &mut Roster) {
    let Some(group_sets) = roster.lms_group_sets.as_mut() else {
        return;
    };
    for group_set in group_sets {
        if group_set.origin == GroupSetOrigin::Local {
            continue;
        }
        for group in &mut group_set.groups {
            if group.needs_reresolution && group.resolved_member_ids.is_empty() {
                continue;
            }
            group.needs_reresolution = true;
            group.resolved_member_ids.clear();
        }
    }
}

fn reresolve_cached_groups_if_needed(roster: &mut Roster) {
    // Build the lookup map before mutably borrowing group_sets
    let lms_to_student = build_lms_student_map(roster);
    let Some(group_sets) = roster.lms_group_sets.as_mut() else {
        return;
    };
    for group_set in group_sets {
        if group_set.origin == GroupSetOrigin::Local {
            continue;
        }
        for group in &mut group_set.groups {
            if !group.needs_reresolution && group.unresolved_count == 0 {
                continue;
            }
            let (resolved_member_ids, unresolved_count) =
                resolve_member_ids(&lms_to_student, &group.lms_member_ids);
            group.resolved_member_ids = resolved_member_ids;
            group.unresolved_count = unresolved_count as i64;
            group.needs_reresolution = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generated::types::LmsGroupSetCacheEntry;
    use crate::roster::{
        Assignment, AssignmentId, AssignmentType, Group, GroupDraft, Roster, Student, StudentDraft,
        StudentId,
    };
    use chrono::TimeZone;
    use lms_common::LmsType;

    fn student_with_lms(id: &str, lms_id: &str) -> Student {
        Student::new(StudentDraft {
            name: format!("Student {id}"),
            email: format!("{id}@example.com"),
            lms_user_id: Some(lms_id.to_string()),
            ..Default::default()
        })
    }

    fn cache_entry_with_groups(id: &str, groups: Vec<CachedLmsGroup>) -> LmsGroupSetCacheEntry {
        LmsGroupSetCacheEntry {
            id: id.to_string(),
            origin: GroupSetOrigin::Lms,
            name: format!("Set {id}"),
            groups,
            fetched_at: Some(Utc.with_ymd_and_hms(2025, 1, 1, 12, 0, 0).unwrap()),
            lms_group_set_id: Some(id.to_string()),
            lms_type: LmsType::Canvas,
            base_url: "https://example.edu".to_string(),
            course_id: "course-1".to_string(),
        }
    }

    #[test]
    fn build_cached_groups_resolves_members_and_counts_unresolved() {
        let student = student_with_lms("s1", "u1");
        let roster = Roster {
            source: None,
            students: vec![student.clone()],
            assignments: vec![],
            lms_group_sets: Some(Vec::new()),
        };

        let groups = vec![LmsGroup {
            id: "g1".to_string(),
            name: "Group 1".to_string(),
            member_ids: vec!["u1".to_string(), "u1".to_string(), "missing".to_string()],
        }];

        let cached = build_cached_groups(&roster, groups);
        assert_eq!(cached.len(), 1);
        assert_eq!(cached[0].resolved_member_ids, vec![student.id]);
        assert_eq!(cached[0].unresolved_count, 1);
        assert!(!cached[0].needs_reresolution);
    }

    #[test]
    fn mark_cache_for_reresolution_flags_and_clears() {
        let group_a = CachedLmsGroup {
            id: "g1".to_string(),
            name: "Group 1".to_string(),
            lms_member_ids: vec!["u1".to_string()],
            resolved_member_ids: vec![StudentId("s1".to_string())],
            unresolved_count: 0,
            needs_reresolution: false,
        };
        let group_b = CachedLmsGroup {
            id: "g2".to_string(),
            name: "Group 2".to_string(),
            lms_member_ids: vec!["u2".to_string()],
            resolved_member_ids: Vec::new(),
            unresolved_count: 1,
            needs_reresolution: true,
        };

        let mut roster = Roster {
            source: None,
            students: vec![],
            assignments: vec![],
            lms_group_sets: Some(vec![cache_entry_with_groups(
                "set-1",
                vec![group_a, group_b],
            )]),
        };

        mark_cache_for_reresolution(&mut roster);

        let groups = &roster.lms_group_sets.as_ref().unwrap()[0].groups;
        assert!(groups[0].needs_reresolution);
        assert!(groups[0].resolved_member_ids.is_empty());
        assert!(groups[1].needs_reresolution);
        assert!(groups[1].resolved_member_ids.is_empty());
    }

    #[test]
    fn reresolve_cached_groups_if_needed_updates_entries() {
        let student_a = student_with_lms("s1", "u1");
        let student_b = student_with_lms("s2", "u2");

        let group_needs = CachedLmsGroup {
            id: "g1".to_string(),
            name: "Group 1".to_string(),
            lms_member_ids: vec!["u1".to_string(), "missing".to_string()],
            resolved_member_ids: Vec::new(),
            unresolved_count: 2,
            needs_reresolution: true,
        };
        let group_unresolved = CachedLmsGroup {
            id: "g2".to_string(),
            name: "Group 2".to_string(),
            lms_member_ids: vec!["u2".to_string()],
            resolved_member_ids: Vec::new(),
            unresolved_count: 1,
            needs_reresolution: false,
        };
        let group_ok = CachedLmsGroup {
            id: "g3".to_string(),
            name: "Group 3".to_string(),
            lms_member_ids: vec!["u1".to_string()],
            resolved_member_ids: vec![student_a.id.clone()],
            unresolved_count: 0,
            needs_reresolution: false,
        };

        let mut roster = Roster {
            source: None,
            students: vec![student_a.clone(), student_b.clone()],
            assignments: vec![],
            lms_group_sets: Some(vec![cache_entry_with_groups(
                "set-1",
                vec![group_needs, group_unresolved, group_ok],
            )]),
        };

        reresolve_cached_groups_if_needed(&mut roster);

        let groups = &roster.lms_group_sets.as_ref().unwrap()[0].groups;
        assert_eq!(groups[0].resolved_member_ids, vec![student_a.id.clone()]);
        assert_eq!(groups[0].unresolved_count, 1);
        assert!(!groups[0].needs_reresolution);
        assert_eq!(groups[1].resolved_member_ids, vec![student_b.id]);
        assert_eq!(groups[1].unresolved_count, 0);
        assert!(!groups[1].needs_reresolution);
        assert_eq!(groups[2].resolved_member_ids, vec![student_a.id]);
        assert_eq!(groups[2].unresolved_count, 0);
        assert!(!groups[2].needs_reresolution);
    }

    #[test]
    fn apply_cached_group_set_to_assignment_copies_groups_and_sets_source() {
        let student_a = student_with_lms("s1", "u1");
        let student_b = student_with_lms("s2", "u2");
        let assignment_id = AssignmentId("assignment-1".to_string());
        let assignment = Assignment {
            id: assignment_id.clone(),
            name: "Lab".to_string(),
            description: None,
            assignment_type: AssignmentType::ClassWide,
            groups: vec![Group::new(GroupDraft {
                name: "Old Group".to_string(),
                member_ids: vec![student_a.id.clone()],
            })],
            group_set_cache_id: None,
            source_fetched_at: None,
        };

        let fetched_at = Utc.with_ymd_and_hms(2025, 1, 2, 8, 30, 0).unwrap();
        let cached_group_a = CachedLmsGroup {
            id: "cg1".to_string(),
            name: "Group A".to_string(),
            lms_member_ids: vec!["u1".to_string()],
            resolved_member_ids: vec![student_a.id.clone()],
            unresolved_count: 0,
            needs_reresolution: false,
        };
        let cached_group_b = CachedLmsGroup {
            id: "cg2".to_string(),
            name: "Group B".to_string(),
            lms_member_ids: vec!["u2".to_string()],
            resolved_member_ids: vec![student_b.id.clone()],
            unresolved_count: 0,
            needs_reresolution: false,
        };
        let mut entry = cache_entry_with_groups("set-1", vec![cached_group_a, cached_group_b]);
        entry.fetched_at = Some(fetched_at);

        let roster = Roster {
            source: None,
            students: vec![student_a, student_b],
            assignments: vec![assignment],
            lms_group_sets: Some(vec![entry]),
        };

        let result = apply_cached_group_set_to_assignment(
            roster,
            &assignment_id,
            GroupImportConfig {
                group_set_id: "set-1".to_string(),
                filter: GroupFilter {
                    kind: "all".to_string(),
                    selected: None,
                    pattern: None,
                },
            },
        )
        .unwrap();
        let updated = result
            .roster
            .assignments
            .iter()
            .find(|a| a.id == assignment_id)
            .unwrap();

        assert_eq!(result.summary.groups_replaced, 1);
        assert_eq!(result.summary.groups_imported, 2);
        assert_eq!(result.summary.filter_applied, "All");
        assert_eq!(updated.group_set_cache_id.as_deref(), Some("set-1"));
        assert_eq!(
            updated.source_fetched_at.as_deref(),
            Some(fetched_at.to_rfc3339().as_str())
        );
        let names = updated
            .groups
            .iter()
            .map(|group| group.name.as_str())
            .collect::<Vec<_>>();
        assert!(names.contains(&"Group A"));
        assert!(names.contains(&"Group B"));
    }
}
