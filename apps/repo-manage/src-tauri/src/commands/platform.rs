use crate::error::AppError;
use repo_manage_core::{Platform, PlatformAPI, StudentTeam};
use std::path::PathBuf;

use super::types::{CloneParams, CommandResult, ConfigParams, SetupParams};
use super::utils::canonicalize_dir;

/// Create a Platform instance from configuration parameters
fn create_platform(config: &ConfigParams) -> Result<Platform, AppError> {
    if config.base_url.starts_with('/') || config.base_url.contains("local") {
        // Local filesystem platform
        Platform::local(
            PathBuf::from(&config.base_url),
            config.student_repos_group.clone(),
            config.user.clone(),
        )
        .map_err(|e| AppError::new(e.to_string()))
    } else if config.base_url.contains("github") {
        Platform::github(
            config.base_url.clone(),
            config.access_token.clone(),
            config.student_repos_group.clone(),
            config.user.clone(),
        )
        .map_err(|e| AppError::new(e.to_string()))
    } else if config.base_url.contains("gitlab") {
        Platform::gitlab(
            config.base_url.clone(),
            config.access_token.clone(),
            config.student_repos_group.clone(),
            config.user.clone(),
        )
        .map_err(|e| AppError::new(e.to_string()))
    } else if config.base_url.contains("gitea") {
        Platform::gitea(
            config.base_url.clone(),
            config.access_token.clone(),
            config.student_repos_group.clone(),
            config.user.clone(),
        )
        .map_err(|e| AppError::new(e.to_string()))
    } else {
        Err(AppError::new(
            "Unknown platform. URL must contain 'github', 'gitlab', 'gitea', or be a filesystem path",
        ))
    }
}

/// Verify platform configuration and authentication
#[tauri::command]
#[specta::specta]
pub async fn verify_config(params: ConfigParams) -> Result<CommandResult, AppError> {
    let platform = create_platform(&params)?;

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
pub async fn setup_repos(params: SetupParams) -> Result<CommandResult, AppError> {
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

    let platform = create_platform(&params.config)?;

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
pub async fn clone_repos(params: CloneParams) -> Result<CommandResult, AppError> {
    // Validate target folder exists before doing any work
    let _target_path = canonicalize_dir(&params.target_folder)
        .map_err(|e| AppError::with_details("Target folder is invalid", e.to_string()))?;

    // TODO: Implement clone functionality
    Err(AppError::new("Clone functionality not yet implemented"))
}
