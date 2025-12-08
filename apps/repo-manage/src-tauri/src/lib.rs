mod error;

use error::AppError;
use repo_manage_core::{
    create_lms_client_with_params, generate_repobee_yaml_with_progress,
    get_student_info_with_progress, get_token_generation_instructions, open_token_generation_url,
    write_csv_file, write_yaml_file, AppSettings, FetchProgress, GuiSettings, LmsClientTrait,
    LmsCommonType, LmsMemberOption, Platform, PlatformAPI, SettingsLoadResult, SettingsManager,
    StudentTeam, YamlConfig,
};
use serde::{Deserialize, Serialize};
use std::fs;
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

/// Export TypeScript bindings for the Tauri commands.
pub fn export_bindings(
    output_path: impl AsRef<std::path::Path>,
) -> Result<(), Box<dyn std::error::Error>> {
    let builder = create_specta_builder();
    builder.export(
        specta_typescript::Typescript::default(),
        output_path.as_ref(),
    )?;

    // Post-process the generated TypeScript
    let content = fs::read_to_string(output_path.as_ref())?;

    // Remove @ts-nocheck comments
    let content = content
        .lines()
        .filter(|line| !line.trim_start().starts_with("// @ts-nocheck"))
        .collect::<Vec<_>>()
        .join("\n");

    // Fix TypeScript errors in generated code:
    // 1. Remove conflicting TAURI_CHANNEL type definition (conflicts with import)
    // 2. Mark unused __makeEvents__ function with @ts-expect-error
    let content = content
        .lines()
        .filter(|line| !line.starts_with("export type TAURI_CHANNEL<TSend>"))
        .collect::<Vec<_>>()
        .join("\n");

    let content = content.replace(
        "function __makeEvents__",
        "// @ts-expect-error Generated but unused when no events defined\nfunction __makeEvents__",
    );

    fs::write(output_path.as_ref(), content)?;
    Ok(())
}

/// Creates a tauri-specta builder with all commands registered.
/// Single source of truth for command registration.
fn create_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
        load_settings,
        save_settings,
        load_app_settings,
        save_app_settings,
        reset_settings,
        get_default_settings,
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

/// Resolve and validate a directory path (existence + is_dir)
fn canonicalize_dir(path_str: &str) -> Result<PathBuf, AppError> {
    let path = expand_tilde(path_str);
    if !path.exists() {
        return Err(AppError::with_details(
            "Path does not exist",
            path.to_string_lossy().to_string(),
        ));
    }
    if !path.is_dir() {
        return Err(AppError::with_details(
            "Path is not a directory",
            path.to_string_lossy().to_string(),
        ));
    }
    match path.canonicalize() {
        Ok(p) => Ok(p),
        Err(e) => Err(AppError::with_details(
            "Failed to canonicalize path",
            format!("{} ({})", path.to_string_lossy(), e),
        )),
    }
}

fn expand_tilde(path_str: &str) -> PathBuf {
    if let Some(stripped) = path_str.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    if path_str == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }
    PathBuf::from(path_str)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn canonicalize_dir_accepts_existing_directory() {
        let dir = tempdir().unwrap();
        let path_str = dir.path().to_string_lossy().to_string();
        let result = canonicalize_dir(&path_str).unwrap();
        assert!(result.is_absolute());
        assert!(result.ends_with(dir.path().file_name().unwrap()));
    }

    #[test]
    fn canonicalize_dir_rejects_missing_directory() {
        let missing = "/this/path/should/not/exist";
        let err = canonicalize_dir(missing).unwrap_err();
        assert!(err.message.contains("does not exist"));
    }

    #[test]
    fn canonicalize_dir_rejects_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("file.txt");
        fs::write(&file_path, "hi").unwrap();
        let err = canonicalize_dir(&file_path.to_string_lossy()).unwrap_err();
        assert!(err.message.contains("not a directory"));
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
struct VerifyCourseParams {
    base_url: String,
    access_token: String,
    course_id: String,
    lms_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
struct GenerateFilesParams {
    base_url: String,
    access_token: String,
    course_id: String,
    lms_type: String,
    yaml_file: String,
    output_folder: String,
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
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
struct ConfigParams {
    access_token: String,
    user: String,
    base_url: String,
    student_repos_group: String,
    template_group: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
struct SetupParams {
    config: ConfigParams,
    yaml_file: String,
    assignments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
struct CloneParams {
    config: ConfigParams,
    yaml_file: String,
    assignments: String,
    target_folder: String,
    directory_layout: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
struct CommandResult {
    success: bool,
    message: String,
    details: Option<String>,
}

// ===== Settings Commands =====

/// Load settings from disk with warnings for any corrected issues
#[tauri::command]
#[specta::specta]
async fn load_settings() -> Result<SettingsLoadResult, AppError> {
    let manager = SettingsManager::new()?;
    let result = manager.load_with_warnings()?;
    Ok(result)
}

/// Save settings to disk (both app and profile)
#[tauri::command]
#[specta::specta]
async fn save_settings(settings: GuiSettings) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save(&settings)?;
    Ok(())
}

/// Load app-level settings (theme, window position, etc.)
#[tauri::command]
#[specta::specta]
async fn load_app_settings() -> Result<AppSettings, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.load_app_settings()?)
}

/// Save only app-level settings (theme, window position, etc.)
#[tauri::command]
#[specta::specta]
async fn save_app_settings(settings: AppSettings) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save_app_settings(&settings)?;
    Ok(())
}

/// Reset settings to defaults
#[tauri::command]
#[specta::specta]
async fn reset_settings() -> Result<GuiSettings, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.reset()?;
    Ok(settings)
}

/// Get default settings (single source of truth from Rust)
#[tauri::command]
#[specta::specta]
async fn get_default_settings() -> GuiSettings {
    GuiSettings::default()
}

/// Get settings file path
#[tauri::command]
#[specta::specta]
async fn get_settings_path() -> Result<String, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.settings_file_path().to_string_lossy().to_string())
}

/// Check if settings file exists
#[tauri::command]
#[specta::specta]
async fn settings_exist() -> Result<bool, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.settings_exist())
}

/// Import settings from a specific file
#[tauri::command]
#[specta::specta]
async fn import_settings(path: String) -> Result<GuiSettings, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.load_from(std::path::Path::new(&path))?;
    Ok(settings)
}

/// Export settings to a specific file
#[tauri::command]
#[specta::specta]
async fn export_settings(settings: GuiSettings, path: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save_to(&settings, std::path::Path::new(&path))?;
    Ok(())
}

/// Get the JSON schema for GuiSettings
#[tauri::command]
#[specta::specta]
async fn get_settings_schema() -> Result<String, AppError> {
    Ok(serde_json::to_string(&SettingsManager::get_schema()?)
        .map_err(|e| AppError::new(e.to_string()))?)
}

/// Load settings or return defaults (never fails)
#[tauri::command]
#[specta::specta]
async fn load_settings_or_default() -> Result<GuiSettings, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.load_or_default())
}

// ===== Profile Commands =====

/// List all available profiles
#[tauri::command]
#[specta::specta]
async fn list_profiles() -> Result<Vec<String>, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.list_profiles()?)
}

/// Get the currently active profile
#[tauri::command]
#[specta::specta]
async fn get_active_profile() -> Result<Option<String>, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.get_active_profile()?)
}

/// Set the active profile
#[tauri::command]
#[specta::specta]
async fn set_active_profile(name: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.set_active_profile(&name)?;
    Ok(())
}

/// Load a profile by name
#[tauri::command]
#[specta::specta]
async fn load_profile(name: String) -> Result<GuiSettings, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.load_profile(&name)?)
}

/// Save current settings as a named profile
#[tauri::command]
#[specta::specta]
async fn save_profile(name: String, settings: GuiSettings) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save_profile(&name, &settings)?;
    Ok(())
}

/// Delete a profile by name
#[tauri::command]
#[specta::specta]
async fn delete_profile(name: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.delete_profile(&name)?;
    Ok(())
}

/// Rename a profile
#[tauri::command]
#[specta::specta]
async fn rename_profile(old_name: String, new_name: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.rename_profile(&old_name, &new_name)?;
    Ok(())
}

/// Get token generation instructions for an LMS type
#[tauri::command]
#[specta::specta]
async fn get_token_instructions(lms_type: String) -> Result<String, AppError> {
    let lms_type_enum = parse_lms_type(&lms_type)?;
    Ok(get_token_generation_instructions(lms_type_enum).to_string())
}

/// Open the LMS token generation page in the browser
#[tauri::command]
#[specta::specta]
async fn open_token_url(base_url: String, lms_type: String) -> Result<(), AppError> {
    let lms_type_enum = parse_lms_type(&lms_type)?;
    open_token_generation_url(&base_url, lms_type_enum)?;
    Ok(())
}

// ===== LMS Commands =====

/// Verify LMS course credentials and fetch course information
#[tauri::command]
#[specta::specta]
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
#[specta::specta]
async fn generate_lms_files(
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

/// Verify platform configuration and authentication
#[tauri::command]
#[specta::specta]
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
#[specta::specta]
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
#[specta::specta]
async fn clone_repos(params: CloneParams) -> Result<CommandResult, AppError> {
    // Validate target folder exists before doing any work
    let _target_path = canonicalize_dir(&params.target_folder)
        .map_err(|e| AppError::with_details("Target folder is invalid", e.to_string()))?;

    // TODO: Implement clone functionality
    Err(AppError::new("Clone functionality not yet implemented"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = create_specta_builder();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            // Theme is now controlled by the frontend via useTheme hook
            // based on saved settings and system preference
            Ok(())
        })
        .invoke_handler(builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
