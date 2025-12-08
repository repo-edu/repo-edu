use crate::error::AppError;
use repo_manage_core::{
    create_lms_client_with_params, generate_repobee_yaml_with_progress,
    get_student_info_with_progress, get_token_generation_instructions, open_token_generation_url,
    write_csv_file, write_yaml_file, FetchProgress, LmsClientTrait, LmsMemberOption, YamlConfig,
};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

use super::types::{CommandResult, GenerateFilesParams, VerifyCourseParams};
use super::utils::{
    canonicalize_dir, emit_inline_message, emit_standard_message, lms_display_name, parse_lms_type,
    InlineCliState,
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
pub async fn verify_lms_course(params: VerifyCourseParams) -> Result<CommandResult, AppError> {
    let lms_label = lms_display_name(&params.lms_type);
    let client = create_lms_client_with_params(
        &params.lms_type,
        params.base_url.clone(),
        params.access_token,
    )?;

    // Get course info using user-provided course identifier
    let course = client.get_course(&params.course_id).await?;

    Ok(CommandResult {
        success: true,
        message: format!("✓ {} course verified: {}", lms_label, course.name),
        details: Some(format!(
            "Course ID: {}\nCourse Name: {}\nCourse Code: {}",
            course.id,
            course.name,
            course.course_code.as_deref().unwrap_or("N/A")
        )),
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

    let lms_label = lms_display_name(&params.lms_type);
    let client =
        create_lms_client_with_params(&params.lms_type, params.base_url, params.access_token)?;

    let cli_progress = Arc::new(Mutex::new(InlineCliState::default()));

    // Fetch student information using unified client
    let fetch_progress_state = Arc::clone(&cli_progress);
    let fetch_progress_channel = progress.clone();
    let course_id = params.course_id.clone();
    let students =
        get_student_info_with_progress(&client, &course_id, move |update| match update {
            FetchProgress::FetchingUsers => {
                emit_standard_message(
                    &fetch_progress_channel,
                    &format!("Fetching students from {}...", lms_label),
                );
            }
            FetchProgress::FetchingGroups => {
                emit_standard_message(
                    &fetch_progress_channel,
                    &format!("Fetching groups from {}...", lms_label),
                );
            }
            FetchProgress::FetchedUsers { count } => {
                emit_standard_message(
                    &fetch_progress_channel,
                    &format!("Retrieved {} students", count),
                );
            }
            FetchProgress::FetchedGroups { count } => {
                emit_standard_message(
                    &fetch_progress_channel,
                    &format!("Retrieved {} groups", count),
                );
            }
            FetchProgress::FetchingGroupMembers {
                current,
                total,
                group_name,
            } => {
                if let Ok(mut state) = fetch_progress_state.lock() {
                    emit_inline_message(
                        &fetch_progress_channel,
                        &mut state,
                        &format!(
                            "Fetching {} group memberships {}/{}: {}",
                            lms_label,
                            current,
                            total.max(1),
                            group_name
                        ),
                    );
                }
            }
        })
        .await?;

    if let Ok(mut state) = cli_progress.lock() {
        state.finalize();
    }

    let student_count = students.len();

    emit_standard_message(
        &progress,
        &format!("Fetched {} students from {}.", student_count, lms_label),
    );
    emit_standard_message(&progress, "Preparing files...");
    let mut generated_files = Vec::new();

    // Generate YAML file if requested
    if params.yaml {
        let config = YamlConfig {
            member_option: LmsMemberOption::from_str(&params.member_option),
            include_group: params.include_group,
            include_member: params.include_member,
            include_initials: params.include_initials,
            full_groups: params.full_groups,
        };

        let teams = generate_repobee_yaml_with_progress(
            &students,
            &config,
            |_, _, _| {}, // YAML generation is too fast to need progress
        )?;

        let yaml_path = output_path.join(&params.yaml_file);
        write_yaml_file(&teams, &yaml_path)?;

        // Get absolute path for display
        let absolute_yaml_path = yaml_path.canonicalize().unwrap_or(yaml_path.clone());
        generated_files.push(format!(
            "YAML: {} ({} teams)",
            absolute_yaml_path.display(),
            teams.len()
        ));
    }

    // Generate CSV file if requested
    if params.csv {
        let csv_path = output_path.join(&params.csv_file);
        write_csv_file(&students, &csv_path)?;

        // Get absolute path for display
        let absolute_csv_path = csv_path.canonicalize().unwrap_or(csv_path.clone());
        generated_files.push(format!("CSV: {}", absolute_csv_path.display()));
    }

    // Generate Excel file if requested (TODO: implement Excel writer)
    if params.xlsx {
        return Err(AppError::new("Excel file generation not yet implemented"));
    }

    Ok(CommandResult {
        success: true,
        message: format!("✓ Successfully generated {} file(s)", generated_files.len()),
        details: Some(format!(
            "Students processed: {}\n\nGenerated files:\n{}",
            student_count,
            generated_files.join("\n")
        )),
    })
}
