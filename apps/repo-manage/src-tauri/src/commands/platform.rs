use crate::error::AppError;
use repo_manage_core::{SetupParams as CoreSetupParams, StudentTeam, VerifyParams};
use std::path::PathBuf;

use super::types::{CloneParams, CommandResult, ConfigParams, SetupParams};
use super::utils::canonicalize_dir;

/// Verify platform configuration and authentication
#[tauri::command]
pub async fn verify_config(params: ConfigParams) -> Result<CommandResult, AppError> {
    let verify_params = VerifyParams {
        platform_type: None, // Auto-detect from URL
        base_url: params.base_url.clone(),
        access_token: params.access_token,
        organization: params.student_repos.clone(),
        user: params.user.clone(),
    };

    repo_manage_core::verify_platform(&verify_params, |_| {}).await?;

    let platform_name = if params.base_url.starts_with('/') || params.base_url.contains("local") {
        "Local (filesystem)"
    } else {
        &params.base_url
    };

    Ok(CommandResult {
        success: true,
        message: format!(
            "✓ Configuration verified successfully for {}",
            params.student_repos
        ),
        details: Some(format!(
            "Platform: {}\nOrganization: {}\nUser: {}",
            platform_name, params.student_repos, params.user
        )),
    })
}

/// Create student repositories from templates
#[tauri::command]
pub async fn setup_repos(params: SetupParams) -> Result<CommandResult, AppError> {
    // Parse YAML file to get student teams
    let yaml_content = std::fs::read_to_string(&params.yaml_file)
        .map_err(|e| AppError::new(format!("Failed to read YAML file: {}", e)))?;

    let student_teams: Vec<StudentTeam> = serde_yaml::from_str(&yaml_content)
        .map_err(|e| AppError::new(format!("Failed to parse YAML file: {}", e)))?;

    // Parse assignments (comma-separated template names)
    let templates: Vec<String> = params
        .assignments
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    if templates.is_empty() {
        return Err(AppError::new("No assignments specified"));
    }

    // Determine work directory
    let work_dir = PathBuf::from("./repobee-work");

    // Build setup params
    let setup_params = CoreSetupParams {
        platform_type: None, // Auto-detect from URL
        base_url: params.config.base_url.clone(),
        access_token: params.config.access_token.clone(),
        organization: params.config.student_repos.clone(),
        user: params.config.user.clone(),
        template_org: if params.config.template.is_empty() {
            None
        } else {
            Some(params.config.template.clone())
        },
        templates,
        student_teams,
        work_dir,
        private: true,
    };

    let result = repo_manage_core::setup_repos(&setup_params, |_| {}).await?;

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
pub async fn clone_repos(params: CloneParams) -> Result<CommandResult, AppError> {
    // Validate target folder exists before doing any work
    let _target_path = canonicalize_dir(&params.target_folder)
        .map_err(|e| AppError::with_details("Target folder is invalid", e.to_string()))?;

    // TODO: Implement clone functionality
    Err(AppError::new("Clone functionality not yet implemented"))
}
