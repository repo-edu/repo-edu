use crate::error::AppError;
use repo_manage_core::{AppSettings, GuiSettings, SettingsLoadResult, SettingsManager};

/// Load settings from disk with warnings for any corrected issues
#[tauri::command]
#[specta::specta]
pub async fn load_settings() -> Result<SettingsLoadResult, AppError> {
    let manager = SettingsManager::new()?;
    let result = manager.load_with_warnings()?;
    Ok(result)
}

/// Save settings to disk (both app and profile)
#[tauri::command]
#[specta::specta]
pub async fn save_settings(settings: GuiSettings) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save(&settings)?;
    Ok(())
}

/// Load app-level settings (theme, window position, etc.)
#[tauri::command]
#[specta::specta]
pub async fn load_app_settings() -> Result<AppSettings, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.load_app_settings()?)
}

/// Save only app-level settings (theme, window position, etc.)
#[tauri::command]
#[specta::specta]
pub async fn save_app_settings(settings: AppSettings) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save_app_settings(&settings)?;
    Ok(())
}

/// Reset settings to defaults
#[tauri::command]
#[specta::specta]
pub async fn reset_settings() -> Result<GuiSettings, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.reset()?;
    Ok(settings)
}

/// Get default settings (single source of truth from Rust)
#[tauri::command]
#[specta::specta]
pub async fn get_default_settings() -> GuiSettings {
    GuiSettings::default()
}

/// Get settings file path
#[tauri::command]
#[specta::specta]
pub async fn get_settings_path() -> Result<String, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.settings_file_path().to_string_lossy().to_string())
}

/// Check if settings file exists
#[tauri::command]
#[specta::specta]
pub async fn settings_exist() -> Result<bool, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.settings_exist())
}

/// Import settings from a specific file
#[tauri::command]
#[specta::specta]
pub async fn import_settings(path: String) -> Result<GuiSettings, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.load_from(std::path::Path::new(&path))?;
    Ok(settings)
}

/// Export settings to a specific file
#[tauri::command]
#[specta::specta]
pub async fn export_settings(settings: GuiSettings, path: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.save_to(&settings, std::path::Path::new(&path))?;
    Ok(())
}

/// Get the JSON schema for GuiSettings
#[tauri::command]
#[specta::specta]
pub async fn get_settings_schema() -> Result<String, AppError> {
    serde_json::to_string(&SettingsManager::get_schema()?).map_err(|e| AppError::new(e.to_string()))
}

/// Load settings or return defaults (never fails)
#[tauri::command]
#[specta::specta]
pub async fn load_settings_or_default() -> Result<GuiSettings, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.load_or_default())
}
