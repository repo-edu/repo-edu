use crate::error::AppError;
use repo_manage_core::{ProfileSettings, SettingsLoadResult, SettingsManager};

/// List all available profiles
#[tauri::command]
#[specta::specta]
pub async fn list_profiles() -> Result<Vec<String>, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.list_profiles()?)
}

/// Get the currently active profile
#[tauri::command]
#[specta::specta]
pub async fn get_active_profile() -> Result<Option<String>, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.get_active_profile()?)
}

/// Set the active profile
#[tauri::command]
#[specta::specta]
pub async fn set_active_profile(name: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.set_active_profile(&name)?;
    Ok(())
}

/// Load a profile by name, returning any migration warnings
#[tauri::command]
#[specta::specta]
pub async fn load_profile(name: String) -> Result<SettingsLoadResult, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.load_profile_with_warnings(&name)?)
}

/// Save profile settings as a named profile (app settings are not touched)
#[tauri::command]
#[specta::specta]
pub async fn save_profile(name: String, settings: ProfileSettings) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save_profile_settings(&name, &settings)?;
    manager.set_active_profile(&name)?;
    Ok(())
}

/// Delete a profile by name
#[tauri::command]
#[specta::specta]
pub async fn delete_profile(name: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.delete_profile(&name)?;
    Ok(())
}

/// Rename a profile
#[tauri::command]
#[specta::specta]
pub async fn rename_profile(old_name: String, new_name: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.rename_profile(&old_name, &new_name)?;
    Ok(())
}
