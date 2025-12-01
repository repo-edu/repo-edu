mod error;

use error::AppError;
use repo_manage_core::{
    create_lms_client_with_params, generate_repobee_yaml_with_progress,
    get_student_info_with_progress, get_token_generation_instructions, open_token_generation_url,
    write_csv_file, write_yaml_file, AppSettings, FetchProgress, GuiSettings, LmsClientTrait,
    LmsCommonType, LmsMemberOption, Platform, PlatformAPI, SettingsManager, StudentTeam,
    YamlConfig,
};
use serde::{Deserialize, Serialize};
use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

const PROGRESS_PREFIX: &str = "[PROGRESS]";

#[derive(Default)]
struct InlineCliState {
    active: bool,
    last_len: usize,
}

impl InlineCliState {
    fn update(&mut self, message: &str) {
        print!("\r{}", message);
        if message.len() < self.last_len {
            let padding = " ".repeat(self.last_len - message.len());
            print!("{}", padding);
        }
        if let Err(e) = io::stdout().flush() {
            eprintln!("Failed to flush CLI progress: {}", e);
        }
        self.last_len = message.len();
        self.active = true;
    }

    fn finalize(&mut self) {
        if self.active {
            println!();
            self.active = false;
            self.last_len = 0;
        }
    }
}

fn emit_gui_message(channel: &Channel<String>, payload: String) {
    if let Err(e) = channel.send(payload) {
        eprintln!("Failed to send progress update: {}", e);
    }
}

fn emit_standard_message(channel: &Channel<String>, message: &str) {
    emit_gui_message(channel, message.to_string());
    println!("{}", message);
}

fn emit_inline_message(channel: &Channel<String>, state: &mut InlineCliState, message: &str) {
    emit_gui_message(channel, format!("{} {}", PROGRESS_PREFIX, message));
    state.update(message);
}

fn parse_lms_type(lms_type: &str) -> Result<LmsCommonType, AppError> {
    match lms_type {
        "Canvas" => Ok(LmsCommonType::Canvas),
        "Moodle" => Ok(LmsCommonType::Moodle),
        other => Err(AppError::new(format!(
            "Unknown LMS type: {}. Supported: Canvas, Moodle",
            other
        ))),
    }
}

fn lms_display_name(lms_type: &str) -> &str {
    match lms_type {
        "Canvas" => "Canvas",
        "Moodle" => "Moodle",
        _ => "LMS",
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VerifyCourseParams {
    base_url: String,
    access_token: String,
    course_id: String,
    lms_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GenerateFilesParams {
    base_url: String,
    access_token: String,
    course_id: String,
    lms_type: String,
    yaml_file: String,
    info_file_folder: String,
    csv_file: String,
    xlsx_file: String,
    member_option: String,
    include_group: bool,
    include_member: bool,
    include_initials: bool,
    full_groups: bool,
    csv: bool,
    xlsx: bool,
    yaml: bool,
}

// Git platform related parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ConfigParams {
    access_token: String,
    user: String,
    base_url: String,
    student_repos_group: String,
    template_group: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SetupParams {
    config: ConfigParams,
    yaml_file: String,
    assignments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CloneParams {
    config: ConfigParams,
    yaml_file: String,
    assignments: String,
    target_folder: String,
    directory_layout: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CommandResult {
    success: bool,
    message: String,
    details: Option<String>,
}

// ===== Settings Commands =====

/// Load settings from disk
#[tauri::command]
async fn load_settings() -> Result<GuiSettings, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.load()?;
    Ok(settings)
}

/// Save settings to disk (both app and profile)
#[tauri::command]
async fn save_settings(settings: GuiSettings) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save(&settings)?;
    Ok(())
}

/// Load app-level settings (theme, window position, etc.)
#[tauri::command]
async fn load_app_settings() -> Result<AppSettings, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.load_app_settings()?)
}

/// Save only app-level settings (theme, window position, etc.)
#[tauri::command]
async fn save_app_settings(settings: AppSettings) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save_app_settings(&settings)?;
    Ok(())
}

/// Reset settings to defaults
#[tauri::command]
async fn reset_settings() -> Result<GuiSettings, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.reset()?;
    Ok(settings)
}

/// Get settings file path
#[tauri::command]
async fn get_settings_path() -> Result<String, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.settings_file_path().to_string_lossy().to_string())
}

/// Check if settings file exists
#[tauri::command]
async fn settings_exist() -> Result<bool, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.settings_exist())
}

/// Import settings from a specific file
#[tauri::command]
async fn import_settings(path: String) -> Result<GuiSettings, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.load_from(std::path::Path::new(&path))?;
    Ok(settings)
}

/// Export settings to a specific file
#[tauri::command]
async fn export_settings(settings: GuiSettings, path: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save_to(&settings, std::path::Path::new(&path))?;
    Ok(())
}

/// Get the JSON schema for GuiSettings
#[tauri::command]
async fn get_settings_schema() -> Result<serde_json::Value, AppError> {
    Ok(SettingsManager::get_schema()?)
}

/// Load settings or return defaults (never fails)
#[tauri::command]
async fn load_settings_or_default() -> Result<GuiSettings, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.load_or_default())
}

// ===== Profile Commands =====

/// List all available profiles
#[tauri::command]
async fn list_profiles() -> Result<Vec<String>, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.list_profiles()?)
}

/// Get the currently active profile
#[tauri::command]
async fn get_active_profile() -> Result<Option<String>, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.get_active_profile()?)
}

/// Set the active profile
#[tauri::command]
async fn set_active_profile(name: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.set_active_profile(&name)?;
    Ok(())
}

/// Load a profile by name
#[tauri::command]
async fn load_profile(name: String) -> Result<GuiSettings, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.load_profile(&name)?)
}

/// Save current settings as a named profile
#[tauri::command]
async fn save_profile(name: String, settings: GuiSettings) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save_profile(&name, &settings)?;
    Ok(())
}

/// Delete a profile by name
#[tauri::command]
async fn delete_profile(name: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.delete_profile(&name)?;
    Ok(())
}

/// Rename a profile
#[tauri::command]
async fn rename_profile(old_name: String, new_name: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.rename_profile(&old_name, &new_name)?;
    Ok(())
}

/// Get token generation instructions for an LMS type
#[tauri::command]
async fn get_token_instructions(lms_type: String) -> Result<String, AppError> {
    let lms_type_enum = parse_lms_type(&lms_type)?;
    Ok(get_token_generation_instructions(lms_type_enum).to_string())
}

/// Open the LMS token generation page in the browser
#[tauri::command]
async fn open_token_url(base_url: String, lms_type: String) -> Result<(), AppError> {
    let lms_type_enum = parse_lms_type(&lms_type)?;
    open_token_generation_url(&base_url, lms_type_enum)?;
    Ok(())
}

// ===== LMS Commands =====

/// Verify LMS course credentials and fetch course information
#[tauri::command]
async fn verify_lms_course(params: VerifyCourseParams) -> Result<CommandResult, AppError> {
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
async fn generate_lms_files(
    params: GenerateFilesParams,
    progress: Channel<String>,
) -> Result<CommandResult, AppError> {
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

        let yaml_path = PathBuf::from(&params.info_file_folder).join(&params.yaml_file);
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
        let csv_path = PathBuf::from(&params.info_file_folder).join(&params.csv_file);
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

/// Verify platform configuration and authentication
#[tauri::command]
async fn verify_config(params: ConfigParams) -> Result<CommandResult, AppError> {
    // Determine platform from base_url
    let platform = if params.base_url.starts_with('/') || params.base_url.contains("local") {
        // Local filesystem platform
        Platform::local(
            PathBuf::from(&params.base_url),
            params.student_repos_group.clone(),
            params.user.clone(),
        )?
    } else if params.base_url.contains("github") {
        Platform::github(
            params.base_url.clone(),
            params.access_token.clone(),
            params.student_repos_group.clone(),
            params.user.clone(),
        )?
    } else if params.base_url.contains("gitlab") {
        Platform::gitlab(
            params.base_url.clone(),
            params.access_token.clone(),
            params.student_repos_group.clone(),
            params.user.clone(),
        )?
    } else if params.base_url.contains("gitea") {
        Platform::gitea(
            params.base_url.clone(),
            params.access_token.clone(),
            params.student_repos_group.clone(),
            params.user.clone(),
        )?
    } else {
        return Err(AppError::new(
            "Unknown platform. URL must contain 'github', 'gitlab', 'gitea', or be a filesystem path",
        ));
    };

    // Verify settings
    platform.verify_settings().await?;

    let platform_name = if params.base_url.starts_with('/') || params.base_url.contains("local") {
        "Local (filesystem)"
    } else {
        &params.base_url
    };

    Ok(CommandResult {
        success: true,
        message: format!(
            "✓ Configuration verified successfully for {}",
            params.student_repos_group
        ),
        details: Some(format!(
            "Platform: {}\nOrganization: {}\nUser: {}",
            platform_name, params.student_repos_group, params.user
        )),
    })
}

/// Create student repositories from templates
#[tauri::command]
async fn setup_repos(params: SetupParams) -> Result<CommandResult, AppError> {
    // Parse YAML file to get student teams
    let yaml_content = std::fs::read_to_string(&params.yaml_file)
        .map_err(|e| AppError::new(format!("Failed to read YAML file: {}", e)))?;

    let student_teams: Vec<StudentTeam> = serde_yaml::from_str(&yaml_content)
        .map_err(|e| AppError::new(format!("Failed to parse YAML file: {}", e)))?;

    // Parse assignments (comma-separated template names)
    let assignments: Vec<String> = params
        .assignments
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    if assignments.is_empty() {
        return Err(AppError::new("No assignments specified"));
    }

    // Create template URLs from assignments and template group
    let template_urls: Vec<String> = assignments
        .iter()
        .map(|assignment| {
            let path = if params.config.template_group.is_empty() {
                // No template group specified, use student repos group
                format!(
                    "{}/{}/{}",
                    params.config.base_url, params.config.student_repos_group, assignment
                )
            } else if params.config.template_group.starts_with('/') {
                // Template group is an absolute path, use it directly
                format!("{}/{}", params.config.template_group, assignment)
            } else {
                // Template group is relative, concatenate with base URL
                format!(
                    "{}/{}/{}",
                    params.config.base_url, params.config.template_group, assignment
                )
            };

            // For local filesystem paths, git2 expects regular paths without file:// prefix
            path
        })
        .collect();

    // Determine platform
    let platform = if params.config.base_url.starts_with('/')
        || params.config.base_url.contains("local")
    {
        // Local filesystem platform
        Platform::local(
            PathBuf::from(&params.config.base_url),
            params.config.student_repos_group.clone(),
            params.config.user.clone(),
        )?
    } else if params.config.base_url.contains("github") {
        Platform::github(
            params.config.base_url.clone(),
            params.config.access_token.clone(),
            params.config.student_repos_group.clone(),
            params.config.user.clone(),
        )?
    } else if params.config.base_url.contains("gitlab") {
        Platform::gitlab(
            params.config.base_url.clone(),
            params.config.access_token.clone(),
            params.config.student_repos_group.clone(),
            params.config.user.clone(),
        )?
    } else if params.config.base_url.contains("gitea") {
        Platform::gitea(
            params.config.base_url.clone(),
            params.config.access_token.clone(),
            params.config.student_repos_group.clone(),
            params.config.user.clone(),
        )?
    } else {
        return Err(AppError::new(
            "Unknown platform. URL must contain 'github', 'gitlab', 'gitea', or be a filesystem path",
        ));
    };

    // Create work directory
    let work_dir = PathBuf::from("./repobee-work");
    std::fs::create_dir_all(&work_dir)
        .map_err(|e| AppError::new(format!("Failed to create work directory: {}", e)))?;

    // Run setup
    let result = repo_manage_core::setup_student_repos(
        &template_urls,
        &student_teams,
        &platform,
        &work_dir,
        true, // private repos
        Some(&params.config.access_token),
    )
    .await?;

    let details = format!(
        "Successfully created: {} repositories\nAlready existed: {} repositories\nErrors: {}",
        result.successful_repos.len(),
        result.existing_repos.len(),
        result.errors.len()
    );

    if result.is_success() {
        Ok(CommandResult {
            success: true,
            message: "Student repositories created successfully!".to_string(),
            details: Some(details),
        })
    } else {
        let error_details = result
            .errors
            .iter()
            .map(|e| format!("  - {}/{}: {}", e.team_name, e.repo_name, e.error))
            .collect::<Vec<_>>()
            .join("\n");

        Ok(CommandResult {
            success: false,
            message: format!("Setup completed with {} errors", result.errors.len()),
            details: Some(format!("{}\n\nErrors:\n{}", details, error_details)),
        })
    }
}

/// Clone student repositories (stub for now)
#[tauri::command]
async fn clone_repos(_params: CloneParams) -> Result<CommandResult, AppError> {
    // TODO: Implement clone functionality
    // For now, return a stub response
    Err(AppError::new("Clone functionality not yet implemented"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            // Theme is now controlled by the frontend via useTheme hook
            // based on saved settings and system preference
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            load_app_settings,
            save_app_settings,
            reset_settings,
            get_settings_path,
            settings_exist,
            import_settings,
            export_settings,
            get_settings_schema,
            load_settings_or_default,
            list_profiles,
            get_active_profile,
            set_active_profile,
            load_profile,
            save_profile,
            delete_profile,
            rename_profile,
            get_token_instructions,
            open_token_url,
            verify_lms_course,
            generate_lms_files,
            verify_config,
            setup_repos,
            clone_repos
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
