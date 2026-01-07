use crate::error::AppError;
use chrono::Utc;
use repo_manage_core::{
    create_lms_client_with_params, generate_lms_files as core_generate_lms_files,
    get_token_generation_instructions, open_token_generation_url,
    verify_lms_course as core_verify_lms_course, GenerateLmsFilesParams, LmsClientTrait,
    ProgressEvent, VerifyLmsParams,
};
use repo_manage_core::{
    import::{normalize_email, parse_students_file},
    lms::create_lms_client,
    roster::{
        AssignmentId, GitUsernameStatus, Group, GroupDraft, Roster, RosterSource, Student,
        StudentDraft,
    },
    CourseInfo, GroupFilter, GroupImportConfig, GroupImportSummary, ImportGroupsResult,
    ImportStudentsResult, ImportSummary, LmsConnection, LmsGroup, LmsGroupSet, LmsIdConflict,
    LmsVerifyResult, SettingsManager,
};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

use super::types::{
    CommandResult, GenerateFilesParams, GetGroupCategoriesParams, GroupCategory,
    VerifyCourseParams, VerifyCourseResult,
};
use super::utils::{
    canonicalize_dir, emit_inline_message, emit_standard_message, parse_lms_type, InlineCliState,
};

/// Get token generation instructions for an LMS type
#[tauri::command]
pub async fn fetch_lms_group_set_list(profile: String) -> Result<Vec<LmsGroupSet>, AppError> {
    let manager = SettingsManager::new()?;
    let app_settings = manager.load_app_settings()?;
    let connection = app_settings
        .lms_connection
        .ok_or_else(|| AppError::new("No LMS connection configured"))?;
    let profile_settings = manager.load_profile_settings(&profile)?;
    let client = create_lms_client(&connection)?;
    let categories = client
        .get_group_categories(&profile_settings.course.id)
        .await?;

    // Return just the group set names/ids without fetching groups
    Ok(categories
        .into_iter()
        .map(|category| LmsGroupSet {
            id: category.id,
            name: category.name,
            groups: vec![], // Empty - groups fetched separately
        })
        .collect())
}

#[tauri::command]
pub async fn fetch_lms_groups_for_set(
    profile: String,
    group_set_id: String,
) -> Result<Vec<LmsGroup>, AppError> {
    let manager = SettingsManager::new()?;
    let app_settings = manager.load_app_settings()?;
    let connection = app_settings
        .lms_connection
        .ok_or_else(|| AppError::new("No LMS connection configured"))?;
    let profile_settings = manager.load_profile_settings(&profile)?;
    let client = create_lms_client(&connection)?;

    let groups = client
        .get_groups_for_category(&profile_settings.course.id, Some(&group_set_id))
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

#[tauri::command]
pub async fn get_token_instructions(lms_type: String) -> Result<String, AppError> {
    let lms_type_enum = parse_lms_type(&lms_type)?;
    Ok(get_token_generation_instructions(lms_type_enum).to_string())
}

/// Open the LMS token generation page in the browser
#[tauri::command]
pub async fn open_token_url(base_url: String, lms_type: String) -> Result<(), AppError> {
    let lms_type_enum = parse_lms_type(&lms_type)?;
    open_token_generation_url(&base_url, lms_type_enum)?;
    Ok(())
}

/// Verify LMS course credentials and fetch course information
#[tauri::command]
pub async fn verify_lms_course(params: VerifyCourseParams) -> Result<VerifyCourseResult, AppError> {
    let core_params = VerifyLmsParams {
        lms_type: params.lms_type.clone(),
        base_url: params.base_url,
        access_token: params.access_token,
        course_id: params.course_id,
    };

    let result = core_verify_lms_course(&core_params, |_| {}).await?;

    Ok(VerifyCourseResult {
        course_id: result.course_id,
        course_name: result.course_name,
    })
}

/// Generate student files from an LMS course
#[tauri::command]
pub async fn generate_lms_files(
    params: GenerateFilesParams,
    progress: Channel<String>,
) -> Result<CommandResult, AppError> {
    // Validate output folder exists before doing any work
    let output_path = canonicalize_dir(&params.output_folder)
        .map_err(|e| AppError::with_details("Output folder is invalid", e.to_string()))?;

    // Generate Excel file if requested (TODO: implement Excel writer)
    if params.xlsx {
        return Err(AppError::new("Excel file generation not yet implemented"));
    }

    let core_params = GenerateLmsFilesParams {
        lms_type: params.lms_type.clone(),
        base_url: params.base_url,
        access_token: params.access_token,
        course_id: params.course_id,
        output_folder: output_path,
        yaml: params.yaml,
        yaml_file: params.yaml_file,
        csv: params.csv,
        csv_file: params.csv_file,
        member_option: params.member_option,
        include_group: params.include_group,
        include_member: params.include_member,
        include_initials: params.include_initials,
        full_groups: params.full_groups,
    };

    let cli_progress = Arc::new(Mutex::new(InlineCliState::default()));
    let progress_channel = progress.clone();
    let progress_state = Arc::clone(&cli_progress);

    let result = core_generate_lms_files(&core_params, move |event| match event {
        ProgressEvent::Status(msg) => {
            emit_standard_message(&progress_channel, &msg);
        }
        ProgressEvent::Progress {
            current,
            total,
            message,
        } => {
            if let Ok(mut state) = progress_state.lock() {
                emit_inline_message(
                    &progress_channel,
                    &mut state,
                    &format!("[{}/{}] {}", current, total.max(1), message),
                );
            }
        }
        ProgressEvent::Started { operation } => {
            emit_standard_message(&progress_channel, &format!("Starting: {}", operation));
        }
        ProgressEvent::Completed { operation, details } => {
            let msg = if let Some(d) = details {
                format!("✓ {}: {}", operation, d)
            } else {
                format!("✓ {}", operation)
            };
            emit_standard_message(&progress_channel, &msg);
        }
        _ => {}
    })
    .await?;

    if let Ok(mut state) = cli_progress.lock() {
        state.finalize();
    }

    let mut message = format!(
        "Students processed: {}\nGroups: {}",
        result.student_count, result.group_count
    );
    for line in &result.diagnostics {
        message.push_str(&format!("\n{}", line));
    }
    message.push_str(&format!(
        "\nGenerated files:\n{}",
        result.generated_files.join("\n")
    ));

    Ok(CommandResult {
        success: true,
        message,
        details: None,
    })
}

/// Get group categories (group sets) for a course
#[tauri::command]
pub async fn get_group_categories(
    params: GetGroupCategoriesParams,
) -> Result<Vec<GroupCategory>, AppError> {
    let client = create_lms_client_with_params(
        &params.lms_type,
        params.base_url,
        params.access_token,
        params.user_agent,
    )
    .map_err(|e| AppError::new(e.to_string()))?;

    let categories = client
        .get_group_categories(&params.course_id)
        .await
        .map_err(|e| {
            eprintln!("[get_group_categories] Error: {}", e);
            AppError::new(e.to_string())
        })?;

    // Convert from repo_manage_core::GroupCategory to local GroupCategory
    Ok(categories.into_iter().map(|c| c.into()).collect())
}

#[tauri::command]
pub async fn verify_lms_connection() -> Result<LmsVerifyResult, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.load_app_settings()?;
    let connection = settings
        .lms_connection
        .ok_or_else(|| AppError::new("No LMS connection configured"))?;
    verify_lms_connection_with(&connection).await
}

#[tauri::command]
pub async fn verify_lms_connection_draft(
    connection: LmsConnection,
) -> Result<LmsVerifyResult, AppError> {
    verify_lms_connection_with(&connection).await
}

#[tauri::command]
pub async fn fetch_lms_courses() -> Result<Vec<CourseInfo>, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.load_app_settings()?;
    let connection = settings
        .lms_connection
        .ok_or_else(|| AppError::new("No LMS connection configured"))?;
    fetch_lms_courses_with(&connection).await
}

#[tauri::command]
pub async fn fetch_lms_courses_draft(
    connection: LmsConnection,
) -> Result<Vec<CourseInfo>, AppError> {
    fetch_lms_courses_with(&connection).await
}

#[tauri::command]
pub async fn import_students_from_lms(
    profile: String,
    roster: Option<Roster>,
) -> Result<ImportStudentsResult, AppError> {
    let manager = SettingsManager::new()?;
    let app_settings = manager.load_app_settings()?;
    let connection = app_settings
        .lms_connection
        .ok_or_else(|| AppError::new("No LMS connection configured"))?;
    let profile_settings = manager.load_profile_settings(&profile)?;
    let client = create_lms_client(&connection)?;
    let users = client.get_users(&profile_settings.course.id).await?;
    merge_lms_students(roster, users, &connection)
}

#[tauri::command]
pub async fn import_students_from_file(
    profile: String,
    roster: Option<Roster>,
    file_path: PathBuf,
) -> Result<ImportStudentsResult, AppError> {
    let _ = profile;
    if !file_path.exists() {
        return Err(AppError::new("Import file not found"));
    }
    let drafts = parse_students_file(&file_path)?;
    merge_file_students(roster, drafts, &file_path)
}

#[tauri::command]
pub async fn fetch_lms_group_sets(profile: String) -> Result<Vec<LmsGroupSet>, AppError> {
    let manager = SettingsManager::new()?;
    let app_settings = manager.load_app_settings()?;
    let connection = app_settings
        .lms_connection
        .ok_or_else(|| AppError::new("No LMS connection configured"))?;
    let profile_settings = manager.load_profile_settings(&profile)?;
    let client = create_lms_client(&connection)?;
    let categories = client
        .get_group_categories(&profile_settings.course.id)
        .await?;

    let mut group_sets = Vec::new();
    for category in categories {
        let groups = client
            .get_groups_for_category(&profile_settings.course.id, Some(&category.id))
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

        group_sets.push(LmsGroupSet {
            id: category.id,
            name: category.name,
            groups: lms_groups,
        });
    }

    Ok(group_sets)
}

#[tauri::command]
pub async fn import_groups_from_lms(
    profile: String,
    roster: Roster,
    assignment_id: AssignmentId,
    config: GroupImportConfig,
) -> Result<ImportGroupsResult, AppError> {
    let manager = SettingsManager::new()?;
    let app_settings = manager.load_app_settings()?;
    let connection = app_settings
        .lms_connection
        .ok_or_else(|| AppError::new("No LMS connection configured"))?;
    let profile_settings = manager.load_profile_settings(&profile)?;
    let client = create_lms_client(&connection)?;

    let categories = client
        .get_group_categories(&profile_settings.course.id)
        .await?;
    let category = categories
        .into_iter()
        .find(|category| category.id == config.group_set_id)
        .ok_or_else(|| AppError::new("Group set not found"))?;

    let groups = client
        .get_groups_for_category(&profile_settings.course.id, Some(&category.id))
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

#[tauri::command]
pub async fn assignment_has_groups(
    roster: Roster,
    assignment_id: AssignmentId,
) -> Result<bool, AppError> {
    let assignment = roster
        .assignments
        .iter()
        .find(|assignment| assignment.id == assignment_id)
        .ok_or_else(|| AppError::new("Assignment not found"))?;
    Ok(!assignment.groups.is_empty())
}

async fn verify_lms_connection_with(
    connection: &LmsConnection,
) -> Result<LmsVerifyResult, AppError> {
    let client = create_lms_client(connection)?;
    client.get_courses().await?;
    Ok(LmsVerifyResult {
        success: true,
        message: format!("Connected to {:?}", connection.lms_type),
        lms_type: Some(connection.lms_type),
    })
}

async fn fetch_lms_courses_with(connection: &LmsConnection) -> Result<Vec<CourseInfo>, AppError> {
    let client = create_lms_client(connection)?;
    let courses = client.get_courses().await?;
    Ok(courses
        .into_iter()
        .map(|course| CourseInfo {
            id: course.id,
            name: course.name,
        })
        .collect())
}

fn merge_lms_students(
    roster: Option<Roster>,
    users: Vec<repo_manage_core::User>,
    connection: &LmsConnection,
) -> Result<ImportStudentsResult, AppError> {
    let base_roster = roster.unwrap_or_else(Roster::empty);

    // Track users with missing emails (will be imported but flagged by validation)
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

        // Skip if already matched by LMS ID
        if lms_index.contains_key(&lms_user_id) {
            continue;
        }

        // Only check email conflicts for users WITH emails
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
        return Err(AppError::new(format!(
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

        // First, try to match by LMS ID (always preferred)
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

        // Then, try to match by email (only if user HAS an email)
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

        // No match found - add as new student
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

fn merge_file_students(
    roster: Option<Roster>,
    drafts: Vec<StudentDraft>,
    file_path: &Path,
) -> Result<ImportStudentsResult, AppError> {
    let base_roster = roster.unwrap_or_else(Roster::empty);
    let mut updated_roster = base_roster.clone();

    let mut email_index: HashMap<String, usize> = HashMap::new();
    for (idx, student) in updated_roster.students.iter().enumerate() {
        email_index.insert(normalize_email(&student.email), idx);
    }

    let mut added = 0;
    let mut updated = 0;
    let mut unchanged = 0;

    for draft in drafts {
        let email = normalize_email(&draft.email);
        if let Some(&idx) = email_index.get(&email) {
            let student = &mut updated_roster.students[idx];
            let changed = update_student_from_file(student, draft);
            if changed {
                updated += 1;
            } else {
                unchanged += 1;
            }
        } else {
            let student = Student::new(draft);
            updated_roster.students.push(student);
            let idx = updated_roster.students.len() - 1;
            email_index.insert(email, idx);
            added += 1;
        }
    }

    updated_roster.source = Some(RosterSource {
        kind: "file".to_string(),
        lms_type: None,
        base_url: None,
        fetched_at: None,
        file_name: file_path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.to_string()),
        imported_at: Some(Utc::now()),
        created_at: None,
    });

    Ok(ImportStudentsResult {
        summary: ImportSummary {
            students_added: added as i64,
            students_updated: updated as i64,
            students_unchanged: unchanged as i64,
            students_missing_email: 0, // File imports don't track this
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

fn update_student_from_file(student: &mut Student, draft: StudentDraft) -> bool {
    let mut changed = false;
    if student.name != draft.name {
        student.name = draft.name;
        changed = true;
    }
    if student.email != draft.email {
        student.email = draft.email;
        changed = true;
    }
    if student.student_number != draft.student_number {
        student.student_number = draft.student_number;
        changed = true;
    }

    for (key, value) in draft.custom_fields {
        if student.custom_fields.get(&key) != Some(&value) {
            student.custom_fields.insert(key, value);
            changed = true;
        }
    }

    if student.git_username.is_none() {
        if let Some(username) = draft.git_username {
            if student.git_username.as_ref() != Some(&username) {
                student.git_username = Some(username);
                student.git_username_status = GitUsernameStatus::Unknown;
                changed = true;
            }
        }
    }

    changed
}

fn apply_group_filter(
    groups: &[LmsGroup],
    filter: &GroupFilter,
) -> Result<(Vec<LmsGroup>, String), AppError> {
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
            let pattern = filter
                .pattern
                .clone()
                .ok_or_else(|| AppError::new("Pattern filter requires a pattern"))?;
            let glob = glob::Pattern::new(&pattern)
                .map_err(|e| AppError::new(format!("Invalid pattern: {}", e)))?;
            let filtered = groups
                .iter()
                .filter(|group| glob.matches(&group.name))
                .cloned()
                .collect::<Vec<_>>();
            Ok((filtered, format!("Pattern: {}", pattern)))
        }
        other => Err(AppError::new(format!("Unknown filter kind: {}", other))),
    }
}

fn merge_lms_groups(
    roster: Roster,
    assignment_id: AssignmentId,
    group_set_id: &str,
    groups: Vec<LmsGroup>,
    filter_label: String,
) -> Result<ImportGroupsResult, AppError> {
    let mut updated_roster = roster.clone();
    let assignment = updated_roster
        .assignments
        .iter_mut()
        .find(|assignment| assignment.id == assignment_id)
        .ok_or_else(|| AppError::new("Assignment not found"))?;

    let mut missing_members = Vec::new();
    let mut name_map: HashMap<String, Vec<String>> = HashMap::new();
    let mut lms_to_student: HashMap<String, repo_manage_core::roster::StudentId> = HashMap::new();
    for student in &updated_roster.students {
        if let Some(lms_id) = student.lms_user_id.as_ref() {
            lms_to_student.insert(lms_id.clone(), student.id.clone());
        }
    }

    let mut new_groups = Vec::new();
    let mut students_referenced = 0;

    for group in groups {
        let normalized = repo_manage_core::import::normalize_group_name(&group.name);
        name_map
            .entry(normalized)
            .or_default()
            .push(group.name.clone());

        let mut member_ids: HashSet<repo_manage_core::roster::StudentId> = HashSet::new();
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
        return Err(AppError::new(format!(
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
        return Err(AppError::new(format!(
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

/// Result of verifying a profile's course against the LMS
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CourseVerifyResult {
    pub success: bool,
    pub message: String,
    pub updated_name: Option<String>,
}

/// Verify that the active profile's course exists in the configured LMS.
/// Returns success/failure and optionally the updated course name if it changed.
#[tauri::command]
pub async fn verify_profile_course(profile: String) -> Result<CourseVerifyResult, AppError> {
    let manager = SettingsManager::new()?;
    let app_settings = manager.load_app_settings()?;
    let connection = app_settings
        .lms_connection
        .ok_or_else(|| AppError::new("No LMS connection configured"))?;

    let profile_settings = manager.load_profile_settings(&profile)?;
    let course_id = &profile_settings.course.id;

    if course_id.is_empty() {
        return Err(AppError::new("Profile has no course ID configured"));
    }

    let courses = fetch_lms_courses_with(&connection).await?;

    // Find the course by ID
    let found_course = courses.iter().find(|c| c.id == *course_id);

    match found_course {
        Some(course) => {
            let updated_name = if course.name != profile_settings.course.name {
                Some(course.name.clone())
            } else {
                None
            };
            Ok(CourseVerifyResult {
                success: true,
                message: "Course verified".to_string(),
                updated_name,
            })
        }
        None => Ok(CourseVerifyResult {
            success: false,
            message: format!("Course '{}' not found in LMS", course_id),
            updated_name: None,
        }),
    }
}
