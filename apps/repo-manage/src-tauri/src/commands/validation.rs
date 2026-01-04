use crate::error::AppError;
use repo_manage_core::roster::{
    validate_assignment as validate_assignment_core, validate_roster as validate_roster_core,
    AssignmentId, Roster, ValidationResult,
};
use repo_manage_core::{GitIdentityMode, GitServerType, SettingsManager};

/// Validate roster (students)
#[tauri::command]
pub async fn validate_roster(roster: Roster) -> Result<ValidationResult, AppError> {
    Ok(validate_roster_core(&roster))
}

/// Validate assignment groups within a roster
#[tauri::command]
pub async fn validate_assignment(
    profile: String,
    roster: Roster,
    assignment_id: AssignmentId,
) -> Result<ValidationResult, AppError> {
    let manager = SettingsManager::new()?;
    let profile_settings = manager.load_profile_settings(&profile)?;

    let identity_mode = if let Some(connection_name) = profile_settings.git_connection.as_deref() {
        let app_settings = manager.load_app_settings()?;
        let connection = app_settings
            .git_connections
            .get(connection_name)
            .ok_or_else(|| {
                AppError::new(format!("Git connection '{}' not found", connection_name))
            })?;
        match connection.server_type {
            GitServerType::GitLab => connection.identity_mode.unwrap_or_default(),
            GitServerType::GitHub | GitServerType::Gitea => GitIdentityMode::Username,
        }
    } else {
        GitIdentityMode::Username
    };

    Ok(validate_assignment_core(
        &roster,
        &assignment_id,
        identity_mode,
    ))
}
