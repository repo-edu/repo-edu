use crate::import::normalize_email;
use crate::lms::create_lms_client;
use crate::roster::{
    generate_group_id, EnrollmentType, Group, MemberStatus, Roster, RosterMember,
    RosterMemberDraft, RosterMemberId, ORIGIN_LMS,
};
use crate::{
    GroupSetConnection, GroupSetSyncResult, ImportConflict, ImportRosterResult,
    ImportStudentsResult, ImportSummary, LmsGroup, LmsGroupSet, LmsOperationContext,
    LmsVerifyResult,
};
use chrono::Utc;
use lms_common::LmsClient as LmsClientTrait;
use std::collections::{HashMap, HashSet};

use super::error::HandlerError;

pub async fn verify_connection(
    context: &LmsOperationContext,
) -> Result<LmsVerifyResult, HandlerError> {
    let client = create_lms_client(&context.connection)?;
    client.validate_token().await?;
    Ok(LmsVerifyResult {
        success: true,
        message: format!("Connected to {:?}", context.connection.lms_type),
        lms_type: Some(context.connection.lms_type),
    })
}

/// Import roster members from LMS, splitting into students and staff.
///
/// Merges LMS users into the existing roster using match priority:
/// lms_user_id (exact) → email (case-insensitive) → student_number (exact).
/// Conflicts are reported but do not fail the import.
pub async fn import_students(
    context: &LmsOperationContext,
    existing_roster: Option<Roster>,
) -> Result<ImportStudentsResult, HandlerError> {
    let client = create_lms_client(&context.connection)?;
    let users = client.get_users(&context.course_id).await?;
    merge_lms_roster(existing_roster, users, context)
}

/// Import roster members from LMS with full conflict reporting.
///
/// Returns ImportRosterResult with detailed conflict information.
pub async fn import_roster_from_lms(
    context: &LmsOperationContext,
    existing_roster: Option<Roster>,
) -> Result<ImportRosterResult, HandlerError> {
    import_roster_from_lms_with_progress(context, existing_roster, |_| {}).await
}

/// Import roster members from LMS with full conflict reporting and progress updates.
pub async fn import_roster_from_lms_with_progress<F>(
    context: &LmsOperationContext,
    existing_roster: Option<Roster>,
    mut on_progress: F,
) -> Result<ImportRosterResult, HandlerError>
where
    F: FnMut(String),
{
    on_progress("Connecting to LMS...".to_string());
    let client = create_lms_client(&context.connection)?;
    on_progress("Fetching roster pages from LMS...".to_string());
    let users = client
        .get_users_with_progress(&context.course_id, |page, loaded_users| {
            on_progress(format!(
                "Fetched roster page {} ({} users loaded)",
                page, loaded_users
            ));
        })
        .await?;
    on_progress(format!(
        "Building roster preview for {} users...",
        users.len()
    ));
    merge_lms_roster_with_conflicts(existing_roster, users, context)
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
    fetch_groups_for_set_with_members(&client, &context.course_id, group_set_id).await
}

/// Sync an LMS-connected group set from the LMS.
///
/// Fetches current groups from LMS, matches by lms_group_id, and returns
/// a patch result for the frontend to merge.
pub async fn sync_group_set(
    context: &LmsOperationContext,
    roster: &Roster,
    group_set_id: &str,
) -> Result<GroupSetSyncResult, HandlerError> {
    sync_group_set_with_progress(context, roster, group_set_id, |_| {}).await
}

/// Sync an LMS-connected group set from the LMS and report fetch progress.
pub async fn sync_group_set_with_progress<F>(
    context: &LmsOperationContext,
    roster: &Roster,
    group_set_id: &str,
    mut on_progress: F,
) -> Result<GroupSetSyncResult, HandlerError>
where
    F: FnMut(String),
{
    let group_set = roster
        .find_group_set(group_set_id)
        .ok_or_else(|| HandlerError::not_found("Group set not found"))?;

    // Extract LMS group set ID from connection metadata
    let connection = group_set
        .connection
        .as_ref()
        .ok_or_else(|| HandlerError::Validation("Group set has no connection".into()))?;
    let lms_group_set_id = match connection {
        GroupSetConnection::Canvas { group_set_id, .. } => group_set_id.as_str(),
        GroupSetConnection::Moodle { grouping_id, .. } => grouping_id.as_str(),
        _ => {
            return Err(HandlerError::Validation(
                "Group set is not LMS-connected".into(),
            ));
        }
    };

    // Fetch current groups from LMS
    on_progress("Connecting to LMS...".to_string());
    let client = create_lms_client(&context.connection)?;
    on_progress("Fetching groups from LMS...".to_string());
    let lms_groups = fetch_groups_for_set_with_members_with_progress(
        &client,
        &context.course_id,
        lms_group_set_id,
        &mut on_progress,
    )
    .await?;
    on_progress(format!(
        "Building group set patch for {} groups...",
        lms_groups.len()
    ));

    // Build lms_user_id -> RosterMemberId map for member resolution
    let lms_to_member = build_lms_member_map(roster);

    // Build existing group lookup by lms_group_id
    let mut existing_by_lms_id: HashMap<String, &Group> = HashMap::new();
    for gid in &group_set.group_ids {
        if let Some(group) = roster.find_group(gid) {
            if let Some(lms_gid) = &group.lms_group_id {
                existing_by_lms_id.insert(lms_gid.clone(), group);
            }
        }
    }

    let mut groups_upserted = Vec::new();
    let mut new_group_ids = Vec::new();
    let mut missing_members = Vec::new();
    let mut total_missing: i64 = 0;

    for lms_group in &lms_groups {
        let (member_ids, missing_count) =
            resolve_lms_member_ids(&lms_to_member, &lms_group.member_ids);
        total_missing += missing_count as i64;

        if missing_count > 0 {
            for lms_member_id in &lms_group.member_ids {
                if !lms_to_member.contains_key(lms_member_id) {
                    missing_members.push(serde_json::json!({
                        "lms_user_id": lms_member_id,
                        "group_name": lms_group.name,
                        "reason": "no_roster_match"
                    }));
                }
            }
        }

        let group = if let Some(existing) = existing_by_lms_id.get(&lms_group.id) {
            // Update existing group in place
            Group {
                id: existing.id.clone(),
                name: lms_group.name.clone(),
                member_ids,
                origin: ORIGIN_LMS.to_string(),
                lms_group_id: Some(lms_group.id.clone()),
            }
        } else {
            // Create new group
            Group {
                id: generate_group_id(),
                name: lms_group.name.clone(),
                member_ids,
                origin: ORIGIN_LMS.to_string(),
                lms_group_id: Some(lms_group.id.clone()),
            }
        };

        new_group_ids.push(group.id.clone());
        groups_upserted.push(group);
    }

    // Find groups that were removed from LMS
    let new_lms_ids: HashSet<&str> = lms_groups.iter().map(|g| g.id.as_str()).collect();
    let mut deleted_group_ids = Vec::new();
    for gid in &group_set.group_ids {
        if let Some(group) = roster.find_group(gid) {
            if let Some(lms_gid) = &group.lms_group_id {
                if !new_lms_ids.contains(lms_gid.as_str()) {
                    deleted_group_ids.push(group.id.clone());
                }
            }
        }
    }

    // Build updated group set
    let mut updated_group_set = group_set.clone();
    updated_group_set.group_ids = new_group_ids;

    // Update connection metadata with sync timestamp
    let now = Utc::now();
    updated_group_set.connection = Some(match connection {
        GroupSetConnection::Canvas {
            course_id,
            group_set_id,
            ..
        } => GroupSetConnection::Canvas {
            course_id: course_id.clone(),
            group_set_id: group_set_id.clone(),
            last_updated: now,
        },
        GroupSetConnection::Moodle {
            course_id,
            grouping_id,
            ..
        } => GroupSetConnection::Moodle {
            course_id: course_id.clone(),
            grouping_id: grouping_id.clone(),
            last_updated: now,
        },
        _ => unreachable!("Already validated as LMS-connected above"),
    });

    Ok(GroupSetSyncResult {
        group_set: updated_group_set,
        groups_upserted,
        deleted_group_ids,
        missing_members,
        total_missing,
    })
}

// --- Internal helpers ---

fn merge_lms_roster(
    roster: Option<Roster>,
    users: Vec<crate::User>,
    context: &LmsOperationContext,
) -> Result<ImportStudentsResult, HandlerError> {
    let result = merge_lms_roster_with_conflicts(roster, users, context)?;
    Ok(ImportStudentsResult {
        summary: result.summary,
        roster: result.roster,
    })
}

fn merge_lms_roster_with_conflicts(
    roster: Option<Roster>,
    users: Vec<crate::User>,
    context: &LmsOperationContext,
) -> Result<ImportRosterResult, HandlerError> {
    let base_roster = roster.unwrap_or_else(Roster::empty);

    let missing_email_count = users
        .iter()
        .filter(|user| user.email.as_deref().unwrap_or("").trim().is_empty())
        .count();

    // Build index maps for matching
    let mut lms_index: HashMap<String, usize> = HashMap::new();
    let mut email_index: HashMap<String, usize> = HashMap::new();
    let mut student_number_index: HashMap<String, usize> = HashMap::new();

    // Index both students and staff
    let all_members: Vec<&RosterMember> = base_roster
        .students
        .iter()
        .chain(base_roster.staff.iter())
        .collect();

    for (idx, member) in all_members.iter().enumerate() {
        if let Some(lms_id) = member.lms_user_id.as_ref() {
            lms_index.insert(lms_id.clone(), idx);
        }
        let normalized_email = normalize_email(&member.email);
        if !normalized_email.is_empty() {
            email_index.insert(normalized_email, idx);
        }
        if let Some(sn) = member.student_number.as_ref() {
            if !sn.is_empty() {
                student_number_index.insert(sn.clone(), idx);
            }
        }
    }

    let mut conflicts = Vec::new();
    let mut updated_students = base_roster.students.clone();
    let mut updated_staff = base_roster.staff.clone();

    let mut added = 0i64;
    let mut updated_count = 0i64;
    let mut unchanged = 0i64;

    for user in users {
        let email = normalize_email(user.email.as_deref().unwrap_or(""));
        let lms_user_id = user.id.clone();
        let student_number = user.login_id.clone();

        // Determine enrollment type from LMS data
        let lms_enrollment_type = user
            .primary_enrollment_type()
            .map(|et| match et {
                lms_common::EnrollmentType::Student => EnrollmentType::Student,
                lms_common::EnrollmentType::Teacher => EnrollmentType::Teacher,
                lms_common::EnrollmentType::Ta => EnrollmentType::Ta,
                lms_common::EnrollmentType::Designer => EnrollmentType::Designer,
                lms_common::EnrollmentType::Observer => EnrollmentType::Observer,
                lms_common::EnrollmentType::Other => EnrollmentType::Other,
            })
            .unwrap_or(EnrollmentType::Student);

        let enrollment_display = user.primary_enrollment_display();
        let member_status = match user.enrollment_status() {
            "active" => MemberStatus::Active,
            "dropped" => MemberStatus::Dropped,
            _ => MemberStatus::Incomplete,
        };
        let member_status = if email.is_empty() && member_status == MemberStatus::Active {
            MemberStatus::Incomplete
        } else {
            member_status
        };

        let is_student = lms_enrollment_type == EnrollmentType::Student;

        // Match priority: lms_user_id → email → student_number
        let matched_idx = lms_index
            .get(&lms_user_id)
            .copied()
            .or_else(|| {
                if !email.is_empty() {
                    email_index.get(&email).copied()
                } else {
                    None
                }
            })
            .or_else(|| {
                student_number
                    .as_ref()
                    .and_then(|sn| student_number_index.get(sn).copied())
            });

        // Check for ambiguous matches (multiple members with same key)
        if let Some(idx) = matched_idx {
            let member = all_members[idx];

            // Check for LMS ID conflict
            if let Some(existing_lms_id) = &member.lms_user_id {
                if !existing_lms_id.is_empty() && existing_lms_id != &lms_user_id {
                    conflicts.push(ImportConflict {
                        match_key: "lms_user_id".to_string(),
                        value: email.clone(),
                        matched_ids: vec![member.id.clone()],
                    });
                    continue;
                }
            }

            // Update existing member
            let was_student = member.enrollment_type == EnrollmentType::Student;
            let member_id = member.id.clone();

            let updated_member = RosterMember {
                id: member_id.clone(),
                name: user.name.clone(),
                email: if email.is_empty() {
                    member.email.clone()
                } else {
                    email.clone()
                },
                student_number: student_number.or_else(|| member.student_number.clone()),
                git_username: member.git_username.clone(),
                git_username_status: member.git_username_status,
                status: member_status,
                lms_status: Some(member_status),
                lms_user_id: Some(lms_user_id.clone()),
                enrollment_type: lms_enrollment_type,
                enrollment_display,
                department: member.department.clone(),
                institution: member.institution.clone(),
                source: "lms".to_string(),
            };

            let changed = updated_member.name != member.name
                || updated_member.email != member.email
                || updated_member.student_number != member.student_number
                || updated_member.lms_user_id != member.lms_user_id
                || updated_member.enrollment_type != member.enrollment_type
                || updated_member.status != member.status;

            // Handle enrollment type change (student <-> staff)
            if was_student != is_student {
                // Remove from old list, add to new list
                if was_student {
                    updated_students.retain(|m| m.id != member_id);
                    updated_staff.push(updated_member);
                } else {
                    updated_staff.retain(|m| m.id != member_id);
                    updated_students.push(updated_member);
                }
                updated_count += 1;
            } else if is_student {
                if let Some(m) = updated_students.iter_mut().find(|m| m.id == member_id) {
                    *m = updated_member;
                }
                if changed {
                    updated_count += 1;
                } else {
                    unchanged += 1;
                }
            } else {
                if let Some(m) = updated_staff.iter_mut().find(|m| m.id == member_id) {
                    *m = updated_member;
                }
                if changed {
                    updated_count += 1;
                } else {
                    unchanged += 1;
                }
            }
        } else {
            // New member
            let draft = RosterMemberDraft {
                name: user.name.clone(),
                email: email.clone(),
                student_number,
                git_username: None,
                lms_user_id: Some(lms_user_id),
                status: Some(member_status),
                lms_status: Some(member_status),
                enrollment_type: Some(lms_enrollment_type),
                enrollment_display,
                source: Some("lms".to_string()),
                ..Default::default()
            };
            let new_member = RosterMember::new(draft);

            if is_student {
                updated_students.push(new_member);
            } else {
                updated_staff.push(new_member);
            }
            added += 1;
        }
    }

    // Build updated roster connection
    let now = Utc::now();
    let roster_connection = match context.connection.lms_type {
        lms_common::LmsType::Canvas => crate::RosterConnection::Canvas {
            course_id: context.course_id.clone(),
            last_updated: now,
        },
        lms_common::LmsType::Moodle => crate::RosterConnection::Moodle {
            course_id: context.course_id.clone(),
            last_updated: now,
        },
    };

    let mut updated_roster = Roster {
        connection: Some(roster_connection),
        students: updated_students,
        staff: updated_staff,
        groups: base_roster.groups,
        group_sets: base_roster.group_sets,
        assignments: base_roster.assignments,
    };
    updated_roster.sort_members_by_name();

    let total_conflicts = conflicts.len() as i64;

    Ok(ImportRosterResult {
        summary: ImportSummary {
            students_added: added,
            students_updated: updated_count,
            students_unchanged: unchanged,
            students_missing_email: missing_email_count as i64,
        },
        roster: updated_roster,
        conflicts,
        total_conflicts,
    })
}

async fn fetch_groups_for_set_with_members(
    client: &lms_client::LmsClient,
    course_id: &str,
    group_set_id: &str,
) -> Result<Vec<LmsGroup>, HandlerError> {
    fetch_groups_for_set_with_members_with_progress(client, course_id, group_set_id, |_| {}).await
}

async fn fetch_groups_for_set_with_members_with_progress<F>(
    client: &lms_client::LmsClient,
    course_id: &str,
    group_set_id: &str,
    mut on_progress: F,
) -> Result<Vec<LmsGroup>, HandlerError>
where
    F: FnMut(String),
{
    let groups = client
        .get_groups_for_category_with_progress(course_id, Some(group_set_id), |page, loaded| {
            on_progress(format!(
                "Fetched group page {} ({} groups loaded)",
                page, loaded
            ));
        })
        .await?;

    let mut lms_groups = Vec::new();
    for group in groups {
        let group_name = group.name.clone();
        let memberships = client
            .get_group_members_with_progress(&group.id, |_page, loaded| {
                on_progress(format!(
                    "Loading members for group {} ({} loaded)",
                    group_name, loaded
                ));
            })
            .await?;
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

fn build_lms_member_map(roster: &Roster) -> HashMap<String, RosterMemberId> {
    let mut map = HashMap::new();
    for member in roster.students.iter().chain(roster.staff.iter()) {
        if let Some(lms_id) = member.lms_user_id.as_ref() {
            map.insert(lms_id.clone(), member.id.clone());
        }
    }
    map
}

fn resolve_lms_member_ids(
    lms_to_member: &HashMap<String, RosterMemberId>,
    lms_member_ids: &[String],
) -> (Vec<RosterMemberId>, usize) {
    let mut resolved = Vec::new();
    let mut seen = HashSet::new();
    let mut unresolved = 0;
    for member_id in lms_member_ids {
        if let Some(roster_id) = lms_to_member.get(member_id) {
            if seen.insert(roster_id.clone()) {
                resolved.push(roster_id.clone());
            }
        } else {
            unresolved += 1;
        }
    }
    (resolved, unresolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn member_with_lms(name: &str, email: &str, lms_id: &str) -> RosterMember {
        RosterMember::new(RosterMemberDraft {
            name: name.to_string(),
            email: email.to_string(),
            lms_user_id: Some(lms_id.to_string()),
            ..Default::default()
        })
    }

    fn test_context() -> LmsOperationContext {
        LmsOperationContext {
            connection: crate::generated::types::LmsConnection {
                lms_type: crate::generated::types::LmsType::Canvas,
                base_url: "https://canvas.example.edu".to_string(),
                access_token: "token".to_string(),
                user_agent: None,
            },
            course_id: "42".to_string(),
        }
    }

    #[test]
    fn build_lms_member_map_indexes_all_members() {
        let student = member_with_lms("Alice", "alice@example.com", "u1");
        let staff = RosterMember::new(RosterMemberDraft {
            name: "Prof Smith".to_string(),
            email: "smith@example.com".to_string(),
            lms_user_id: Some("u2".to_string()),
            enrollment_type: Some(EnrollmentType::Teacher),
            ..Default::default()
        });

        let roster = Roster {
            connection: None,
            students: vec![student],
            staff: vec![staff],
            groups: Vec::new(),
            group_sets: Vec::new(),
            assignments: Vec::new(),
        };

        let map = build_lms_member_map(&roster);
        assert_eq!(map.len(), 2);
        assert!(map.contains_key("u1"));
        assert!(map.contains_key("u2"));
    }

    #[test]
    fn resolve_lms_member_ids_deduplicates_and_counts_unresolved() {
        let mut map = HashMap::new();
        map.insert("u1".to_string(), RosterMemberId("m1".to_string()));
        map.insert("u2".to_string(), RosterMemberId("m2".to_string()));

        let (resolved, unresolved) = resolve_lms_member_ids(
            &map,
            &["u1".to_string(), "u1".to_string(), "missing".to_string()],
        );

        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0], RosterMemberId("m1".to_string()));
        assert_eq!(unresolved, 1);
    }

    #[test]
    fn resolve_lms_member_ids_empty_input() {
        let map = HashMap::new();
        let (resolved, unresolved) = resolve_lms_member_ids(&map, &[]);
        assert!(resolved.is_empty());
        assert_eq!(unresolved, 0);
    }

    #[test]
    fn resolve_lms_member_ids_all_unresolved() {
        let map = HashMap::new();
        let ids = vec!["u1".to_string(), "u2".to_string(), "u3".to_string()];
        let (resolved, unresolved) = resolve_lms_member_ids(&map, &ids);
        assert!(resolved.is_empty());
        assert_eq!(unresolved, 3);
    }

    fn make_lms_user(id: &str, name: &str, email: &str) -> crate::User {
        crate::User {
            id: id.to_string(),
            name: name.to_string(),
            sortable_name: None,
            short_name: None,
            login_id: None,
            email: Some(email.to_string()),
            avatar_url: None,
            enrollments: Some(vec![lms_common::Enrollment {
                id: format!("enr-{id}"),
                user_id: id.to_string(),
                course_id: "42".to_string(),
                enrollment_type: "StudentEnrollment".to_string(),
                role: None,
                enrollment_state: None,
                limit_privileges_to_course_section: None,
            }]),
        }
    }

    #[test]
    fn merge_lms_roster_sorts_students_by_name() {
        let context = test_context();
        let users = vec![
            make_lms_user("u3", "Charlie Brown", "charlie@example.com"),
            make_lms_user("u1", "Alice Smith", "alice@example.com"),
            make_lms_user("u2", "Bob Jones", "bob@example.com"),
        ];

        let result = merge_lms_roster_with_conflicts(None, users, &context).unwrap();

        let names: Vec<&str> = result
            .roster
            .students
            .iter()
            .map(|s| s.name.as_str())
            .collect();
        assert_eq!(names, vec!["Alice Smith", "Bob Jones", "Charlie Brown"]);
    }

    #[test]
    fn merge_lms_roster_sorts_case_insensitively() {
        let context = test_context();
        let users = vec![
            make_lms_user("u1", "bob Jones", "bob@example.com"),
            make_lms_user("u2", "Alice Smith", "alice@example.com"),
        ];

        let result = merge_lms_roster_with_conflicts(None, users, &context).unwrap();

        let names: Vec<&str> = result
            .roster
            .students
            .iter()
            .map(|s| s.name.as_str())
            .collect();
        assert_eq!(names, vec!["Alice Smith", "bob Jones"]);
    }

    #[test]
    fn merge_lms_roster_sorts_after_reimport() {
        let context = test_context();

        // First import: Alice, Bob
        let initial_users = vec![
            make_lms_user("u1", "Alice Smith", "alice@example.com"),
            make_lms_user("u2", "Bob Jones", "bob@example.com"),
        ];
        let first = merge_lms_roster_with_conflicts(None, initial_users, &context).unwrap();

        // Reimport adds Charlie (who sorts between Alice and Bob)
        let reimport_users = vec![
            make_lms_user("u1", "Alice Smith", "alice@example.com"),
            make_lms_user("u2", "Bob Jones", "bob@example.com"),
            make_lms_user("u3", "Ben Adams", "ben@example.com"),
        ];
        let result =
            merge_lms_roster_with_conflicts(Some(first.roster), reimport_users, &context).unwrap();

        let names: Vec<&str> = result
            .roster
            .students
            .iter()
            .map(|s| s.name.as_str())
            .collect();
        assert_eq!(names, vec!["Alice Smith", "Ben Adams", "Bob Jones"]);
    }

    #[test]
    fn merge_lms_roster_marks_missing_email_active_as_incomplete() {
        let context = test_context();
        let users = vec![crate::User {
            id: "user-1".to_string(),
            name: "Missing Email".to_string(),
            sortable_name: None,
            short_name: None,
            login_id: Some("s123".to_string()),
            email: None,
            avatar_url: None,
            enrollments: Some(vec![lms_common::Enrollment {
                id: "enr-1".to_string(),
                user_id: "user-1".to_string(),
                course_id: "42".to_string(),
                enrollment_type: "StudentEnrollment".to_string(),
                role: None,
                enrollment_state: None,
                limit_privileges_to_course_section: None,
            }]),
        }];

        let result = merge_lms_roster_with_conflicts(None, users, &context).unwrap();

        assert_eq!(result.summary.students_missing_email, 1);
        assert_eq!(result.roster.students.len(), 1);
        assert_eq!(result.roster.students[0].status, MemberStatus::Incomplete);
    }
}
