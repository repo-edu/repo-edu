use crate::error::AppError;
use repo_manage_core::{
    create_lms_client_with_params, generate_lms_files as core_generate_lms_files,
    get_token_generation_instructions, open_token_generation_url,
    verify_lms_course as core_verify_lms_course, GenerateLmsFilesParams, LmsClientTrait,
    ProgressEvent, VerifyLmsParams,
};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

use super::types::{
    CommandResult, GenerateFilesParams, GetGroupCategoriesParams, GetGroupsParams, Group,
    GroupCategory, VerifyCourseParams, VerifyCourseResult,
};
use super::utils::{
    canonicalize_dir, emit_inline_message, emit_standard_message, parse_lms_type, InlineCliState,
};

/// Get token generation instructions for an LMS type
#[tauri::command]
#[specta::specta]
pub async fn get_token_instructions(lms_type: String) -> Result<String, AppError> {
    let lms_type_enum = parse_lms_type(&lms_type)?;
    Ok(get_token_generation_instructions(lms_type_enum).to_string())
}

/// Open the LMS token generation page in the browser
#[tauri::command]
#[specta::specta]
pub async fn open_token_url(base_url: String, lms_type: String) -> Result<(), AppError> {
    let lms_type_enum = parse_lms_type(&lms_type)?;
    open_token_generation_url(&base_url, lms_type_enum)?;
    Ok(())
}

/// Verify LMS course credentials and fetch course information
#[tauri::command]
#[specta::specta]
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
#[specta::specta]
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

    Ok(CommandResult {
        success: true,
        message: format!(
            "✓ Successfully generated {} file(s) from {} students",
            result.generated_files.len(),
            result.student_count
        ),
        details: Some(format!(
            "Students processed: {}\nTeams: {}\n\nGenerated files:\n{}",
            result.student_count,
            result.team_count,
            result.generated_files.join("\n")
        )),
    })
}

/// Get group categories (group sets) for a course
#[tauri::command]
#[specta::specta]
pub async fn get_group_categories(
    params: GetGroupCategoriesParams,
) -> Result<Vec<GroupCategory>, AppError> {
    let client =
        create_lms_client_with_params(&params.lms_type, params.base_url, params.access_token)
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

/// Get groups for a course
#[tauri::command]
#[specta::specta]
pub async fn get_groups(params: GetGroupsParams) -> Result<Vec<Group>, AppError> {
    let client =
        create_lms_client_with_params(&params.lms_type, params.base_url, params.access_token)
            .map_err(|e| AppError::new(e.to_string()))?;

    let groups = client
        .get_groups_for_category(&params.course_id, params.group_category_id.as_deref())
        .await
        .map_err(|e| {
            eprintln!("[get_groups] Error: {}", e);
            AppError::new(e.to_string())
        })?;

    Ok(groups.into_iter().map(|g| g.into()).collect())
}
