use crate::error::AppError;
use repo_manage_core::{CourseInfo, ProfileSettings, SettingsManager};

/// List all available profiles
#[tauri::command]
pub async fn list_profiles() -> Result<Vec<String>, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.list_profiles()?)
}

/// Get the currently active profile
#[tauri::command]
pub async fn get_active_profile() -> Result<Option<String>, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.get_active_profile()?)
}

/// Set the active profile
#[tauri::command]
pub async fn set_active_profile(name: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.set_active_profile(&name)?;
    Ok(())
}

/// Delete a profile by name
#[tauri::command]
pub async fn delete_profile(name: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.delete_profile(&name)?;
    Ok(())
}

/// Rename a profile
#[tauri::command]
pub async fn rename_profile(old_name: String, new_name: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.rename_profile(&old_name, &new_name)?;
    Ok(())
}

/// Create a new profile with required course binding
#[tauri::command]
pub async fn create_profile(name: String, course: CourseInfo) -> Result<ProfileSettings, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.create_profile(&name, course)?)
}
