use crate::error::AppError;
use chrono::Utc;
use repo_manage_core::context;
use repo_manage_core::{
    create_lms_client_with_params, generate_lms_files as core_generate_lms_files,
    get_token_generation_instructions, open_token_generation_url,
    verify_lms_course as core_verify_lms_course, GenerateLmsFilesParams, LmsClientTrait,
    ProgressEvent, VerifyLmsParams,
};
use repo_manage_core::{
    import::{normalize_email, parse_students_file},
    lms::create_lms_client,
    operations,
    roster::{GitUsernameStatus, Roster, RosterMember, RosterMemberDraft},
    CourseInfo, GroupSetSyncResult, ImportRosterResult, ImportStudentsResult, ImportSummary,
    LmsConnection, LmsContextKey, LmsGroup, LmsGroupSet, LmsOperationContext, LmsType,
    LmsVerifyResult, RosterConnection, SettingsManager,
};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

use super::types::{
    CommandResult, GenerateFilesParams, GetGroupCategoriesParams, GroupCategory,
    VerifyCourseParams, VerifyCourseResult,
};
use super::utils::{
    canonicalize_dir, emit_gui_message, emit_inline_message, emit_standard_message, parse_lms_type,
    InlineCliState,
};

/// Fetch LMS group set list (metadata only)
#[tauri::command]
pub async fn fetch_lms_group_set_list(
    context: LmsOperationContext,
) -> Result<Vec<LmsGroupSet>, AppError> {
    operations::fetch_group_set_list(&context)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn fetch_lms_groups_for_set(
    context: LmsOperationContext,
    group_set_id: String,
) -> Result<Vec<LmsGroup>, AppError> {
    operations::fetch_groups_for_set(&context, &group_set_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn normalize_context(
    lms_type: LmsType,
    base_url: String,
    course_id: String,
) -> Result<LmsContextKey, AppError> {
    Ok(context::normalize_context(lms_type, &base_url, &course_id))
}

#[tauri::command]
pub async fn sync_group_set(
    context: LmsOperationContext,
    roster: Roster,
    group_set_id: String,
) -> Result<GroupSetSyncResult, AppError> {
    operations::sync_group_set(&context, &roster, &group_set_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn import_roster_from_lms(
    context: LmsOperationContext,
    roster: Option<Roster>,
    progress: Channel<String>,
) -> Result<ImportRosterResult, AppError> {
    operations::import_roster_from_lms_with_progress(&context, roster, move |message| {
        emit_gui_message(&progress, message);
    })
    .await
    .map_err(Into::into)
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
pub async fn verify_lms_connection(
    context: LmsOperationContext,
) -> Result<LmsVerifyResult, AppError> {
    operations::verify_lms_connection(&context)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn verify_lms_connection_draft(
    context: LmsOperationContext,
) -> Result<LmsVerifyResult, AppError> {
    operations::verify_lms_connection(&context)
        .await
        .map_err(Into::into)
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
    context: LmsOperationContext,
    roster: Option<Roster>,
) -> Result<ImportStudentsResult, AppError> {
    operations::import_students(&context, roster)
        .await
        .map_err(Into::into)
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
    merge_file_members(roster, drafts, &file_path)
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

fn merge_file_members(
    roster: Option<Roster>,
    drafts: Vec<RosterMemberDraft>,
    file_path: &Path,
) -> Result<ImportStudentsResult, AppError> {
    let base_roster = roster.unwrap_or_else(Roster::empty);
    let mut updated_roster = base_roster.clone();
    let mut indexes = build_member_indexes(&updated_roster.students);

    let mut added = 0;
    let mut updated = 0;
    let mut unchanged = 0;
    let mut missing_email = 0i64;

    for draft in drafts {
        if draft.email.trim().is_empty() {
            missing_email += 1;
        }

        if let Some(idx) = resolve_file_match(&indexes, &draft) {
            let member = &mut updated_roster.students[idx];
            let changed = update_member_from_file(member, draft);
            if changed {
                updated += 1;
                indexes = build_member_indexes(&updated_roster.students);
            } else {
                unchanged += 1;
            }
        } else {
            let mut draft = draft;
            if let Some(member_id) = draft.member_id.as_deref().map(str::trim) {
                if indexes.id.contains_key(member_id) {
                    draft.member_id = None;
                }
            }
            let member = RosterMember::new(draft);
            updated_roster.students.push(member);
            added += 1;
            indexes = build_member_indexes(&updated_roster.students);
        }
    }

    updated_roster.connection = Some(RosterConnection::Import {
        source_filename: file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string(),
        last_updated: Utc::now(),
    });
    updated_roster.sort_members_by_name();

    Ok(ImportStudentsResult {
        summary: ImportSummary {
            students_added: added as i64,
            students_updated: updated as i64,
            students_unchanged: unchanged as i64,
            students_missing_email: missing_email,
        },
        roster: updated_roster,
    })
}

fn update_member_from_file(member: &mut RosterMember, draft: RosterMemberDraft) -> bool {
    let mut changed = false;
    if member.name != draft.name {
        member.name = draft.name;
        changed = true;
    }
    if !draft.email.trim().is_empty() && member.email != draft.email {
        member.email = draft.email;
        changed = true;
    }
    if let Some(student_number) = draft.student_number {
        if member.student_number.as_deref() != Some(student_number.as_str()) {
            member.student_number = Some(student_number);
            changed = true;
        }
    }
    if let Some(status) = draft.status {
        if member.status != status {
            member.status = status;
            changed = true;
        }
    }

    if member.git_username.is_none() {
        if let Some(username) = draft.git_username {
            if member.git_username.as_ref() != Some(&username) {
                member.git_username = Some(username);
                member.git_username_status = GitUsernameStatus::Unknown;
                changed = true;
            }
        }
    }

    changed
}

const AMBIGUOUS_INDEX: usize = usize::MAX;

struct MemberIndexes {
    id: HashMap<String, usize>,
    email: HashMap<String, usize>,
    student_number: HashMap<String, usize>,
}

fn build_member_indexes(students: &[RosterMember]) -> MemberIndexes {
    let mut id = HashMap::new();
    let mut email = HashMap::new();
    let mut student_number = HashMap::new();

    for (idx, member) in students.iter().enumerate() {
        let member_id = member.id.as_str().trim();
        if !member_id.is_empty() {
            insert_or_mark_ambiguous(&mut id, member_id.to_string(), idx);
        }

        let normalized_email = normalize_email(&member.email);
        if !normalized_email.is_empty() {
            insert_or_mark_ambiguous(&mut email, normalized_email, idx);
        }

        if let Some(sn) = member.student_number.as_deref() {
            let normalized = normalize_student_number(sn);
            if !normalized.is_empty() {
                insert_or_mark_ambiguous(&mut student_number, normalized, idx);
            }
        }
    }

    MemberIndexes {
        id,
        email,
        student_number,
    }
}

fn resolve_file_match(indexes: &MemberIndexes, draft: &RosterMemberDraft) -> Option<usize> {
    if let Some(member_id) = draft.member_id.as_deref().map(str::trim) {
        if !member_id.is_empty() {
            return unique_index(&indexes.id, member_id);
        }
    }

    let email = normalize_email(&draft.email);
    if !email.is_empty() {
        return unique_index(&indexes.email, &email);
    }

    if let Some(sn) = draft.student_number.as_deref() {
        let normalized = normalize_student_number(sn);
        if !normalized.is_empty() {
            return unique_index(&indexes.student_number, &normalized);
        }
    }
    None
}

fn normalize_student_number(value: &str) -> String {
    value.trim().to_string()
}

fn insert_or_mark_ambiguous(index: &mut HashMap<String, usize>, key: String, value: usize) {
    match index.get_mut(&key) {
        Some(existing) => *existing = AMBIGUOUS_INDEX,
        None => {
            index.insert(key, value);
        }
    }
}

fn unique_index(index: &HashMap<String, usize>, key: &str) -> Option<usize> {
    match index.get(key) {
        Some(idx) if *idx != AMBIGUOUS_INDEX => Some(*idx),
        _ => None,
    }
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

    let client = create_lms_client(&connection)?;

    // Fetch single course by ID (more efficient than fetching all courses)
    match client.get_course(course_id).await {
        Ok(course) => {
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
        Err(_) => Ok(CourseVerifyResult {
            success: false,
            message: format!("Course '{}' not found in LMS", course_id),
            updated_name: None,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use repo_manage_core::roster::MemberStatus;
    use std::path::Path;

    fn roster_with_students(students: Vec<RosterMember>) -> Roster {
        Roster {
            connection: None,
            students,
            staff: Vec::new(),
            groups: Vec::new(),
            group_sets: Vec::new(),
            assignments: Vec::new(),
        }
    }

    #[test]
    fn merge_file_members_matches_by_member_id_without_email() {
        let existing = RosterMember::new(RosterMemberDraft {
            name: "Alice".to_string(),
            email: "".to_string(),
            status: Some(MemberStatus::Active),
            ..Default::default()
        });
        let member_id = existing.id.as_str().to_string();

        let result = merge_file_members(
            Some(roster_with_students(vec![existing])),
            vec![RosterMemberDraft {
                member_id: Some(member_id),
                name: "Alice Updated".to_string(),
                email: "".to_string(),
                status: Some(MemberStatus::Dropped),
                ..Default::default()
            }],
            Path::new("students.csv"),
        )
        .unwrap();

        assert_eq!(result.summary.students_added, 0);
        assert_eq!(result.summary.students_updated, 1);
        assert_eq!(result.summary.students_missing_email, 1);
        assert_eq!(result.roster.students.len(), 1);
        assert_eq!(result.roster.students[0].name, "Alice Updated");
        assert_eq!(result.roster.students[0].status, MemberStatus::Dropped);
    }

    #[test]
    fn merge_file_members_does_not_clear_existing_email_on_blank_file_email() {
        let existing = RosterMember::new(RosterMemberDraft {
            name: "Bob".to_string(),
            email: "bob@example.com".to_string(),
            status: Some(MemberStatus::Active),
            ..Default::default()
        });
        let member_id = existing.id.as_str().to_string();

        let result = merge_file_members(
            Some(roster_with_students(vec![existing])),
            vec![RosterMemberDraft {
                member_id: Some(member_id),
                name: "Bob".to_string(),
                email: "".to_string(),
                status: Some(MemberStatus::Dropped),
                ..Default::default()
            }],
            Path::new("students.csv"),
        )
        .unwrap();

        assert_eq!(result.roster.students.len(), 1);
        assert_eq!(result.roster.students[0].email, "bob@example.com");
        assert_eq!(result.roster.students[0].status, MemberStatus::Dropped);
    }

    #[test]
    fn merge_file_members_with_ambiguous_email_adds_new_student() {
        let first = RosterMember::new(RosterMemberDraft {
            name: "One".to_string(),
            email: "dup@example.com".to_string(),
            ..Default::default()
        });
        let second = RosterMember::new(RosterMemberDraft {
            name: "Two".to_string(),
            email: "dup@example.com".to_string(),
            ..Default::default()
        });

        let result = merge_file_members(
            Some(roster_with_students(vec![first, second])),
            vec![RosterMemberDraft {
                name: "Imported".to_string(),
                email: "dup@example.com".to_string(),
                ..Default::default()
            }],
            Path::new("students.csv"),
        )
        .unwrap();

        assert_eq!(result.summary.students_added, 1);
        assert_eq!(result.summary.students_updated, 0);
        assert_eq!(result.roster.students.len(), 3);
    }
}
