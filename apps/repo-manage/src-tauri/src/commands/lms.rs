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
    operations,
    roster::{AssignmentId, GitUsernameStatus, Roster, RosterSource, Student, StudentDraft},
    CourseInfo, GroupImportConfig, ImportGroupsResult, ImportStudentsResult, ImportSummary,
    LmsConnection, LmsGroup, LmsGroupSet, LmsOperationContext, LmsVerifyResult, SettingsManager,
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
    canonicalize_dir, emit_inline_message, emit_standard_message, parse_lms_type, InlineCliState,
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
    merge_file_students(roster, drafts, &file_path)
}

#[tauri::command]
pub async fn fetch_lms_group_sets(
    context: LmsOperationContext,
) -> Result<Vec<LmsGroupSet>, AppError> {
    let client = create_lms_client(&context.connection)?;
    let categories = client.get_group_categories(&context.course_id).await?;

    let mut group_sets = Vec::new();
    for category in categories {
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
    context: LmsOperationContext,
    roster: Roster,
    assignment_id: AssignmentId,
    config: GroupImportConfig,
) -> Result<ImportGroupsResult, AppError> {
    operations::import_groups(&context, roster, &assignment_id, config)
        .await
        .map_err(Into::into)
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
    if let Some(status) = draft.status {
        if student.status != status {
            student.status = status;
            changed = true;
        }
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
