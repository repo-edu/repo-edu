use crate::error::AppError;
use repo_manage_core::roster::Roster;
use repo_manage_core::{
    AppSettings, GitConnection, GitIdentityMode, GitServerType, ProfileSettings,
    SettingsLoadResult, SettingsManager,
};

/// Load settings from disk with warnings for any corrected issues
#[tauri::command]
pub async fn load_settings() -> Result<SettingsLoadResult, AppError> {
    let manager = SettingsManager::new()?;
    let result = manager.load_with_warnings()?;
    Ok(result)
}

/// Load app-level settings (theme, window position, etc.)
#[tauri::command]
pub async fn load_app_settings() -> Result<AppSettings, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.load_app_settings()?)
}

/// Save only app-level settings (theme, window position, etc.)
#[tauri::command]
pub async fn save_app_settings(settings: AppSettings) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save_app_settings(&settings)?;
    Ok(())
}

/// List saved git connection names
#[tauri::command]
pub async fn list_git_connections() -> Result<Vec<String>, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.load_app_settings()?;
    let mut names: Vec<String> = settings.git_connections.keys().cloned().collect();
    names.sort();
    Ok(names)
}

/// Get a named git connection
#[tauri::command]
pub async fn get_git_connection(name: String) -> Result<GitConnection, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.load_app_settings()?;
    settings
        .git_connections
        .get(&name)
        .cloned()
        .ok_or_else(|| AppError::new(format!("Git connection '{}' not found", name)))
}

/// Save a named git connection
#[tauri::command]
pub async fn save_git_connection(name: String, connection: GitConnection) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    let mut settings = manager.load_app_settings()?;
    settings.git_connections.insert(name, connection);
    manager.save_app_settings(&settings)?;
    Ok(())
}

/// Delete a named git connection
#[tauri::command]
pub async fn delete_git_connection(name: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    let mut settings = manager.load_app_settings()?;
    if settings.git_connections.remove(&name).is_none() {
        return Err(AppError::new(format!(
            "Git connection '{}' not found",
            name
        )));
    }
    manager.save_app_settings(&settings)?;
    Ok(())
}

/// Get identity mode for a connection name
#[tauri::command]
pub async fn get_identity_mode(connection_name: String) -> Result<GitIdentityMode, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.load_app_settings()?;
    let connection = settings
        .git_connections
        .get(&connection_name)
        .ok_or_else(|| AppError::new(format!("Git connection '{}' not found", connection_name)))?;

    let identity_mode = match connection.server_type {
        GitServerType::GitLab => connection.identity_mode.unwrap_or_default(),
        GitServerType::GitHub | GitServerType::Gitea => GitIdentityMode::Username,
    };

    Ok(identity_mode)
}

/// Load profile settings by name, returning any migration warnings
#[tauri::command]
pub async fn load_profile(name: String) -> Result<SettingsLoadResult, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.load_profile(&name)?)
}

/// Save profile settings as a named profile (app settings are not touched)
#[tauri::command]
pub async fn save_profile(name: String, mut profile: ProfileSettings) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    let existing = manager.load_profile_settings(&name)?;
    profile.course = existing.course;

    if let Some(connection_name) = profile.git_connection.as_deref() {
        let app_settings = manager.load_app_settings()?;
        if !app_settings.git_connections.contains_key(connection_name) {
            return Err(AppError::new(format!(
                "Git connection '{}' not found",
                connection_name
            )));
        }
    }

    manager.save_profile_settings(&name, &profile)?;
    manager.set_active_profile(&name)?;
    Ok(())
}

/// Save profile settings and roster together (atomic)
#[tauri::command]
pub async fn save_profile_and_roster(
    name: String,
    mut profile: ProfileSettings,
    roster: Option<Roster>,
) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    let existing = manager.load_profile_settings(&name)?;
    profile.course = existing.course;

    if let Some(connection_name) = profile.git_connection.as_deref() {
        let app_settings = manager.load_app_settings()?;
        if !app_settings.git_connections.contains_key(connection_name) {
            return Err(AppError::new(format!(
                "Git connection '{}' not found",
                connection_name
            )));
        }
    }

    manager.save_profile_and_roster(&name, &profile, roster.as_ref())?;
    manager.set_active_profile(&name)?;
    Ok(())
}

/// Reset settings to defaults
#[tauri::command]
pub async fn reset_settings() -> Result<ProfileSettings, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.reset()?;
    Ok(settings)
}

/// Get default settings (single source of truth from Rust)
#[tauri::command]
pub async fn get_default_settings() -> ProfileSettings {
    ProfileSettings::default()
}

/// Get settings file path
#[tauri::command]
pub async fn get_settings_path() -> Result<String, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.settings_file_path().to_string_lossy().to_string())
}

/// Check if settings file exists
#[tauri::command]
pub async fn settings_exist() -> Result<bool, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.settings_exist())
}

/// Import settings from a specific file
#[tauri::command]
pub async fn import_settings(path: String) -> Result<ProfileSettings, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.load_from(std::path::Path::new(&path))?;
    Ok(settings)
}

/// Export settings to a specific file
#[tauri::command]
pub async fn export_settings(settings: ProfileSettings, path: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save_to(&settings, std::path::Path::new(&path))?;
    Ok(())
}

/// Get the JSON schema for ProfileSettings
#[tauri::command]
pub async fn get_settings_schema() -> Result<String, AppError> {
    serde_json::to_string(&SettingsManager::get_schema()?).map_err(|e| AppError::new(e.to_string()))
}

/// Load settings or return defaults (never fails)
#[tauri::command]
pub async fn load_settings_or_default() -> Result<ProfileSettings, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.load_or_default())
}
