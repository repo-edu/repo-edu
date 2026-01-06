use crate::error::AppError;
use repo_manage_core::{CourseInfo, ProfileSettings, SettingsManager};

/// Open the profiles directory in the system file manager
#[tauri::command]
pub async fn reveal_profiles_directory() -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    let config_dir = manager.config_dir_path().clone();

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&config_dir)
            .spawn()
            .map_err(|e| AppError::new(format!("Failed to open Finder: {}", e)))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&config_dir)
            .spawn()
            .map_err(|e| AppError::new(format!("Failed to open Explorer: {}", e)))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&config_dir)
            .spawn()
            .map_err(|e| AppError::new(format!("Failed to open file manager: {}", e)))?;
    }

    Ok(())
}

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
