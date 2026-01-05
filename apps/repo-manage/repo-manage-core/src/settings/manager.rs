use super::atomic::atomic_write_json;
use super::error::{ConfigError, ConfigResult};
use super::merge::merge_with_defaults_warned;
use super::normalization::Normalize;
use super::validation::Validate;
use super::{AppSettings, ProfileSettings, SettingsLoadResult};
use crate::roster::Roster;
use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const PROFILE_SETTINGS_SCHEMA_JSON: &str =
    include_str!("../../../schemas/types/ProfileSettings.schema.json");

/// Settings manager for loading, saving, and managing application settings
pub struct SettingsManager {
    config_dir: PathBuf,
}

impl SettingsManager {
    /// Create a new settings manager
    ///
    /// Checks for REPOBEE_CONFIG_DIR environment variable first,
    /// then falls back to platform-specific directory.
    pub fn new() -> ConfigResult<Self> {
        let config_dir = Self::get_config_dir()?;
        Self::new_with_dir(config_dir)
    }

    /// Create a new settings manager with a custom config directory
    ///
    /// This is useful for testing or when you want to use a non-standard location.
    pub fn new_with_dir(config_dir: PathBuf) -> ConfigResult<Self> {
        // Ensure config directory exists
        fs::create_dir_all(&config_dir).map_err(|e| ConfigError::CreateDirError {
            path: config_dir.clone(),
            source: e,
        })?;

        Ok(Self { config_dir })
    }

    /// Get platform-specific config directory
    ///
    /// Checks REPOBEE_CONFIG_DIR environment variable first,
    /// then uses platform-specific directories.
    fn get_config_dir() -> ConfigResult<PathBuf> {
        // Check for environment variable override
        if let Ok(config_dir) = std::env::var("REPOBEE_CONFIG_DIR") {
            return Ok(PathBuf::from(config_dir));
        }
        // Try using directories crate first for better XDG compliance
        if let Some(proj_dirs) = directories::ProjectDirs::from("", "", "repo-edu") {
            return Ok(proj_dirs.config_dir().to_path_buf());
        }

        // Fallback to dirs crate
        let config_dir = if cfg!(target_os = "macos") {
            dirs::home_dir()
                .ok_or_else(|| ConfigError::ConfigDirError {
                    message: "Could not find home directory".to_string(),
                })?
                .join("Library")
                .join("Application Support")
                .join("repo-edu")
        } else if cfg!(target_os = "windows") {
            dirs::config_dir()
                .ok_or_else(|| ConfigError::ConfigDirError {
                    message: "Could not find config directory".to_string(),
                })?
                .join("repo-edu")
        } else {
            // Linux and other Unix-like systems
            dirs::config_dir()
                .ok_or_else(|| ConfigError::ConfigDirError {
                    message: "Could not find config directory".to_string(),
                })?
                .join("repo-edu")
        };

        Ok(config_dir)
    }

    // ===== App Settings =====

    /// Get the path to the app settings file
    pub fn app_settings_path(&self) -> PathBuf {
        self.config_dir.join("app.json")
    }

    /// Load app settings from disk
    pub fn load_app_settings(&self) -> ConfigResult<AppSettings> {
        let (settings, _warnings) = self.load_app_settings_warned()?;
        Ok(settings)
    }

    /// Load app settings from disk with warnings for unknown/invalid fields
    fn load_app_settings_warned(&self) -> ConfigResult<(AppSettings, Vec<String>)> {
        let app_file = self.app_settings_path();

        if !app_file.exists() {
            return Ok((AppSettings::default(), vec![]));
        }

        let contents = fs::read_to_string(&app_file).map_err(|e| ConfigError::ReadError {
            path: app_file.clone(),
            source: e,
        })?;

        let raw: serde_json::Value =
            serde_json::from_str(&contents).map_err(|e| ConfigError::JsonParseError {
                path: app_file.clone(),
                source: e,
            })?;

        let result = merge_with_defaults_warned(&raw).map_err(|e| ConfigError::JsonParseError {
            path: app_file.clone(),
            source: e,
        })?;

        let mut settings: AppSettings = result.value;
        settings.normalize();

        Ok((settings, result.warnings))
    }

    /// Save app settings to disk
    pub fn save_app_settings(&self, settings: &AppSettings) -> ConfigResult<()> {
        let app_file = self.app_settings_path();
        atomic_write_json(&app_file, settings)?;
        Ok(())
    }

    // ===== Profile Settings (active) =====

    /// Load active profile settings
    /// Returns default settings if files don't exist (no error)
    /// Creates a "Default" profile if no profiles exist
    pub fn load(&self) -> ConfigResult<ProfileSettings> {
        let result = self.load_with_warnings()?;
        Ok(result.settings)
    }

    /// Load active profile settings with warnings for unknown/invalid fields
    pub fn load_with_warnings(&self) -> ConfigResult<SettingsLoadResult> {
        let mut warnings = Vec::new();

        // Ensure at least one profile exists
        self.ensure_default_profile()?;

        let (profile, profile_warnings) = if let Some(profile_name) = self.get_active_profile()? {
            let (profile, profile_warnings) = self.load_profile_settings_warned(&profile_name)?;
            let warnings = profile_warnings
                .into_iter()
                .map(|w| format!("{}.json: {}", profile_name, w))
                .collect();
            (profile, warnings)
        } else {
            (ProfileSettings::default(), vec![])
        };

        warnings.extend(profile_warnings);

        Ok(SettingsLoadResult {
            settings: profile,
            warnings,
        })
    }

    /// Ensure at least one profile exists, creating "Default" if needed
    fn ensure_default_profile(&self) -> ConfigResult<()> {
        let profiles = self.list_profiles()?;

        if profiles.is_empty() {
            // Create Default profile with default settings
            let default_settings = ProfileSettings::default();
            self.save_profile_settings("Default", &default_settings)?;
            self.set_active_profile("Default")?;
        } else if self.get_active_profile()?.is_none() {
            // Profiles exist but none is active - activate the first one
            if let Some(first_profile) = profiles.first() {
                self.set_active_profile(first_profile)?;
            }
        }

        Ok(())
    }

    /// Get the JSON Schema for ProfileSettings
    pub fn get_schema() -> ConfigResult<Value> {
        serde_json::from_str(PROFILE_SETTINGS_SCHEMA_JSON)
            .map_err(|e| ConfigError::SchemaSerializationError { source: e })
    }

    /// Reset settings to defaults
    pub fn reset(&self) -> ConfigResult<ProfileSettings> {
        let settings = ProfileSettings::default();
        // Don't save on reset - just return defaults
        // User can save if they want to persist
        Ok(settings)
    }

    /// Get the path to the settings file (for backwards compatibility - returns app.json)
    pub fn settings_file_path(&self) -> PathBuf {
        self.app_settings_path()
    }

    /// Get the config directory path
    pub fn config_dir_path(&self) -> &PathBuf {
        &self.config_dir
    }

    /// Check if settings file exists (checks for app.json or any profiles)
    pub fn settings_exist(&self) -> bool {
        self.app_settings_path().exists() || !self.list_profiles().unwrap_or_default().is_empty()
    }

    // ===== Profile Management =====

    /// Get the profiles directory path
    fn profiles_dir(&self) -> PathBuf {
        self.config_dir.join("profiles")
    }

    /// Get the rosters directory path
    fn rosters_dir(&self) -> PathBuf {
        self.config_dir.join("rosters")
    }

    /// Get the active profile file path
    fn active_profile_file(&self) -> PathBuf {
        self.config_dir.join("active-profile.txt")
    }

    /// Ensure profiles directory exists
    fn ensure_profiles_dir(&self) -> ConfigResult<()> {
        let profiles_dir = self.profiles_dir();
        fs::create_dir_all(&profiles_dir).map_err(|e| ConfigError::CreateDirError {
            path: profiles_dir,
            source: e,
        })
    }

    /// Ensure rosters directory exists
    fn ensure_rosters_dir(&self) -> ConfigResult<()> {
        let rosters_dir = self.rosters_dir();
        fs::create_dir_all(&rosters_dir).map_err(|e| ConfigError::CreateDirError {
            path: rosters_dir,
            source: e,
        })
    }

    /// List all available profiles
    pub fn list_profiles(&self) -> ConfigResult<Vec<String>> {
        self.ensure_profiles_dir()?;
        let profiles_dir = self.profiles_dir();

        let mut profiles = Vec::new();
        let entries = fs::read_dir(&profiles_dir).map_err(|e| ConfigError::ReadError {
            path: profiles_dir.clone(),
            source: e,
        })?;

        for entry in entries {
            let entry = entry.map_err(|e| ConfigError::Other(e.to_string()))?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                    profiles.push(name.to_string());
                }
            }
        }

        profiles.sort();
        Ok(profiles)
    }

    /// Get the currently active profile name
    pub fn get_active_profile(&self) -> ConfigResult<Option<String>> {
        let active_file = self.active_profile_file();
        if !active_file.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&active_file).map_err(|e| ConfigError::ReadError {
            path: active_file,
            source: e,
        })?;

        let name = content.trim().to_string();
        if name.is_empty() {
            return Ok(None);
        }

        Ok(Some(name))
    }

    /// Set the active profile
    pub fn set_active_profile(&self, name: &str) -> ConfigResult<()> {
        let active_file = self.active_profile_file();
        fs::write(&active_file, name).map_err(|e| ConfigError::WriteError {
            path: active_file,
            source: e,
        })
    }

    /// Load profile settings by name
    pub fn load_profile_settings(&self, name: &str) -> ConfigResult<ProfileSettings> {
        let (settings, _warnings) = self.load_profile_settings_warned(name)?;
        Ok(settings)
    }

    /// Load profile settings by name with warnings for unknown/invalid fields
    fn load_profile_settings_warned(
        &self,
        name: &str,
    ) -> ConfigResult<(ProfileSettings, Vec<String>)> {
        self.ensure_profiles_dir()?;
        let profile_path = self.profiles_dir().join(format!("{}.json", name));

        if !profile_path.exists() {
            return Err(ConfigError::FileNotFound { path: profile_path });
        }

        let contents = fs::read_to_string(&profile_path).map_err(|e| ConfigError::ReadError {
            path: profile_path.clone(),
            source: e,
        })?;

        let json_value: serde_json::Value =
            serde_json::from_str(&contents).map_err(|e| ConfigError::JsonParseError {
                path: profile_path.clone(),
                source: e,
            })?;

        // Use merge_with_defaults_warned instead of schema validation
        // This handles unknown fields (with warnings) and type mismatches (use default)
        let result =
            merge_with_defaults_warned(&json_value).map_err(|e| ConfigError::JsonParseError {
                path: profile_path,
                source: e,
            })?;

        let mut settings: ProfileSettings = result.value;
        settings.normalize();
        settings.validate()?;

        Ok((settings, result.warnings))
    }

    /// Save profile settings by name
    pub fn save_profile_settings(
        &self,
        name: &str,
        settings: &ProfileSettings,
    ) -> ConfigResult<()> {
        settings.validate()?;
        self.ensure_profiles_dir()?;

        let profile_path = self.profiles_dir().join(format!("{}.json", name));
        atomic_write_json(&profile_path, settings)?;

        Ok(())
    }

    /// Load a profile by name and set it as active
    pub fn load_profile(&self, name: &str) -> ConfigResult<SettingsLoadResult> {
        self.load_profile_with_warnings(name)
    }

    /// Load a profile by name with migration warnings
    pub fn load_profile_with_warnings(&self, name: &str) -> ConfigResult<SettingsLoadResult> {
        let mut all_warnings = Vec::new();

        // Load profile settings with warnings
        let (profile, profile_warnings) = self.load_profile_settings_warned(name)?;
        all_warnings.extend(
            profile_warnings
                .into_iter()
                .map(|w| format!("{}.json: {}", name, w)),
        );

        // Set as active profile
        self.set_active_profile(name)?;

        Ok(SettingsLoadResult {
            settings: profile,
            warnings: all_warnings,
        })
    }

    /// Save current settings as a named profile
    pub fn save_profile(&self, name: &str, settings: &ProfileSettings) -> ConfigResult<()> {
        self.save_profile_settings(name, settings)?;

        // Set as active profile
        self.set_active_profile(name)?;

        Ok(())
    }

    /// Create a new profile with a required course binding
    pub fn create_profile(
        &self,
        name: &str,
        course: super::CourseInfo,
    ) -> ConfigResult<ProfileSettings> {
        let profile_path = self.profiles_dir().join(format!("{}.json", name));
        if profile_path.exists() {
            return Err(ConfigError::Other(format!(
                "Profile '{}' already exists",
                name
            )));
        }

        let settings = ProfileSettings {
            course,
            ..Default::default()
        };
        self.save_profile_settings(name, &settings)?;
        self.set_active_profile(name)?;

        Ok(settings)
    }

    /// Delete a profile by name
    pub fn delete_profile(&self, name: &str) -> ConfigResult<()> {
        let profile_path = self.profiles_dir().join(format!("{}.json", name));
        let roster_path = self.rosters_dir().join(format!("{}.json", name));

        if !profile_path.exists() {
            return Err(ConfigError::FileNotFound { path: profile_path });
        }

        if roster_path.exists() {
            fs::remove_file(&roster_path).map_err(|e| ConfigError::WriteError {
                path: roster_path.clone(),
                source: e,
            })?;
        }

        fs::remove_file(&profile_path).map_err(|e| ConfigError::WriteError {
            path: profile_path,
            source: e,
        })?;

        // Clear active profile if it was the deleted one
        if self.get_active_profile()? == Some(name.to_string()) {
            let active_file = self.active_profile_file();
            let _ = fs::remove_file(active_file);
        }

        Ok(())
    }

    /// Rename a profile
    pub fn rename_profile(&self, old_name: &str, new_name: &str) -> ConfigResult<()> {
        let old_path = self.profiles_dir().join(format!("{}.json", old_name));
        let new_path = self.profiles_dir().join(format!("{}.json", new_name));
        let old_roster_path = self.rosters_dir().join(format!("{}.json", old_name));
        let new_roster_path = self.rosters_dir().join(format!("{}.json", new_name));

        if !old_path.exists() {
            return Err(ConfigError::FileNotFound { path: old_path });
        }

        if new_path.exists() {
            return Err(ConfigError::Other(format!(
                "Profile '{}' already exists",
                new_name
            )));
        }

        if old_roster_path.exists() && new_roster_path.exists() {
            return Err(ConfigError::Other(format!(
                "Roster '{}' already exists",
                new_name
            )));
        }

        fs::rename(&old_path, &new_path).map_err(|e| ConfigError::WriteError {
            path: new_path.clone(),
            source: e,
        })?;

        if old_roster_path.exists() {
            if let Err(error) = fs::rename(&old_roster_path, &new_roster_path) {
                let _ = fs::rename(&new_path, &old_path);
                return Err(ConfigError::WriteError {
                    path: new_roster_path,
                    source: error,
                });
            }
        }

        // Update active profile if it was the renamed one
        if self.get_active_profile()? == Some(old_name.to_string()) {
            self.set_active_profile(new_name)?;
        }

        Ok(())
    }

    // ===== Import/Export (ProfileSettings) =====

    /// Save profile settings to a specific file (for export)
    pub fn save_to(&self, settings: &ProfileSettings, path: &Path) -> ConfigResult<()> {
        settings.validate()?;
        atomic_write_json(path, settings)?;
        Ok(())
    }

    /// Load profile settings from a specific file (for import)
    pub fn load_from(&self, path: &Path) -> ConfigResult<ProfileSettings> {
        if !path.exists() {
            return Err(ConfigError::FileNotFound {
                path: path.to_path_buf(),
            });
        }

        let contents = fs::read_to_string(path).map_err(|e| ConfigError::ReadError {
            path: path.to_path_buf(),
            source: e,
        })?;

        let json_value: Value =
            serde_json::from_str(&contents).map_err(|e| ConfigError::JsonParseError {
                path: path.to_path_buf(),
                source: e,
            })?;

        let result =
            merge_with_defaults_warned(&json_value).map_err(|e| ConfigError::JsonParseError {
                path: path.to_path_buf(),
                source: e,
            })?;

        let mut settings: ProfileSettings = result.value;
        settings.normalize();
        settings.validate()?;

        Ok(settings)
    }

    // ===== Roster Persistence =====

    /// Load roster by profile name
    pub fn load_roster(&self, name: &str) -> ConfigResult<Option<Roster>> {
        self.ensure_rosters_dir()?;
        let roster_path = self.rosters_dir().join(format!("{}.json", name));

        if !roster_path.exists() {
            return Ok(None);
        }

        let contents = fs::read_to_string(&roster_path).map_err(|e| ConfigError::ReadError {
            path: roster_path.clone(),
            source: e,
        })?;

        let roster: Roster =
            serde_json::from_str(&contents).map_err(|e| ConfigError::JsonParseError {
                path: roster_path,
                source: e,
            })?;

        Ok(Some(roster))
    }

    /// Save roster by profile name
    pub fn save_roster(&self, name: &str, roster: &Roster) -> ConfigResult<()> {
        self.ensure_rosters_dir()?;
        let roster_path = self.rosters_dir().join(format!("{}.json", name));
        atomic_write_json(&roster_path, roster)?;
        Ok(())
    }

    /// Delete roster file (if it exists)
    pub fn clear_roster(&self, name: &str) -> ConfigResult<()> {
        let roster_path = self.rosters_dir().join(format!("{}.json", name));
        if roster_path.exists() {
            fs::remove_file(&roster_path).map_err(|e| ConfigError::WriteError {
                path: roster_path,
                source: e,
            })?;
        }
        Ok(())
    }

    /// Save profile settings and roster together using a best-effort atomic swap
    pub fn save_profile_and_roster(
        &self,
        name: &str,
        settings: &ProfileSettings,
        roster: Option<&Roster>,
    ) -> ConfigResult<()> {
        settings.validate()?;
        self.ensure_profiles_dir()?;
        if roster.is_some() {
            self.ensure_rosters_dir()?;
        }

        let profile_path = self.profiles_dir().join(format!("{}.json", name));
        let roster_path = roster.map(|_| self.rosters_dir().join(format!("{}.json", name)));

        let profile_temp = write_temp_json(&profile_path, settings)?;
        let roster_temp = if let (Some(roster), Some(path)) = (roster, roster_path.as_ref()) {
            match write_temp_json(path, roster) {
                Ok(temp_path) => Some(temp_path),
                Err(error) => {
                    let _ = cleanup_temp(&profile_temp);
                    return Err(error);
                }
            }
        } else {
            None
        };

        let profile_backup = match backup_existing(&profile_path) {
            Ok(backup) => backup,
            Err(error) => {
                let _ = cleanup_temp(&profile_temp);
                if let Some(temp_path) = roster_temp.as_ref() {
                    let _ = cleanup_temp(temp_path);
                }
                return Err(error);
            }
        };
        let roster_backup = if let Some(path) = roster_path.as_ref() {
            match backup_existing(path) {
                Ok(backup) => backup,
                Err(error) => {
                    let _ = cleanup_temp(&profile_temp);
                    if let Some(temp_path) = roster_temp.as_ref() {
                        let _ = cleanup_temp(temp_path);
                    }
                    if let Some(backup) = profile_backup.as_ref() {
                        let _ = restore_backup(&profile_path, backup);
                    }
                    return Err(error);
                }
            }
        } else {
            None
        };

        let result = (|| {
            fs::rename(&profile_temp, &profile_path).map_err(|e| ConfigError::WriteError {
                path: profile_path.clone(),
                source: e,
            })?;

            if let (Some(temp_path), Some(path)) = (roster_temp.as_ref(), roster_path.as_ref()) {
                fs::rename(temp_path, path).map_err(|e| ConfigError::WriteError {
                    path: path.clone(),
                    source: e,
                })?;
            }

            Ok(())
        })();

        if result.is_err() {
            let _ = cleanup_temp(&profile_temp);
            if let Some(temp_path) = roster_temp.as_ref() {
                let _ = cleanup_temp(temp_path);
            }
            if let Some(backup) = profile_backup.as_ref() {
                let _ = restore_backup(&profile_path, backup);
            } else {
                let _ = fs::remove_file(&profile_path);
            }
            if let (Some(path), Some(backup)) = (roster_path.as_ref(), roster_backup.as_ref()) {
                let _ = restore_backup(path, backup);
            } else if let Some(path) = roster_path.as_ref() {
                let _ = fs::remove_file(path);
            }
        }

        if result.is_ok() {
            if let Some(backup) = profile_backup {
                let _ = fs::remove_file(backup);
            }
            if let Some(backup) = roster_backup {
                let _ = fs::remove_file(backup);
            }
        }

        result
    }
}

fn write_temp_json<T: serde::Serialize>(path: &Path, value: &T) -> ConfigResult<PathBuf> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| ConfigError::CreateDirError {
            path: parent.to_path_buf(),
            source: e,
        })?;
    }

    let temp_path = path.with_extension("tmp");
    let json = serde_json::to_string_pretty(value).map_err(|e| ConfigError::JsonParseError {
        path: path.to_path_buf(),
        source: e,
    })?;

    let mut temp_file = fs::File::create(&temp_path).map_err(|e| ConfigError::WriteError {
        path: temp_path.clone(),
        source: e,
    })?;
    temp_file
        .write_all(json.as_bytes())
        .map_err(|e| ConfigError::WriteError {
            path: temp_path.clone(),
            source: e,
        })?;
    temp_file.sync_all().map_err(|e| ConfigError::WriteError {
        path: temp_path.clone(),
        source: e,
    })?;
    drop(temp_file);

    Ok(temp_path)
}

fn backup_existing(path: &Path) -> ConfigResult<Option<PathBuf>> {
    if !path.exists() {
        return Ok(None);
    }
    let backup_path = path.with_extension("bak");
    fs::rename(path, &backup_path).map_err(|e| ConfigError::WriteError {
        path: backup_path.clone(),
        source: e,
    })?;
    Ok(Some(backup_path))
}

fn cleanup_temp(path: &Path) -> ConfigResult<()> {
    if path.exists() {
        fs::remove_file(path).map_err(|e| ConfigError::WriteError {
            path: path.to_path_buf(),
            source: e,
        })?;
    }
    Ok(())
}

fn restore_backup(path: &Path, backup_path: &Path) -> ConfigResult<()> {
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    fs::rename(backup_path, path).map_err(|e| ConfigError::WriteError {
        path: path.to_path_buf(),
        source: e,
    })?;
    Ok(())
}

/// Load strategy for error handling
pub enum LoadStrategy {
    /// Return error on any failure
    Strict,
    /// Return default config on error
    DefaultOnError,
}

impl SettingsManager {
    /// Load settings with a specific error handling strategy
    pub fn load_with_strategy(&self, strategy: LoadStrategy) -> ConfigResult<ProfileSettings> {
        match self.load() {
            Ok(settings) => Ok(settings),
            Err(e) => match strategy {
                LoadStrategy::Strict => Err(e),
                LoadStrategy::DefaultOnError => {
                    log::warn!("Failed to load settings, using defaults: {}", e);
                    Ok(ProfileSettings::default())
                }
            },
        }
    }

    /// Load settings or return defaults (never fails)
    pub fn load_or_default(&self) -> ProfileSettings {
        self.load_with_strategy(LoadStrategy::DefaultOnError)
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_config_dir() {
        let config_dir = SettingsManager::get_config_dir().unwrap();
        assert!(config_dir.to_string_lossy().contains("repo-edu"));
    }

    #[test]
    fn test_default_settings() {
        let settings = ProfileSettings::default();
        assert!(settings.course.id.is_empty());
        assert!(settings.course.name.is_empty());
    }

    #[test]
    fn test_serialize_deserialize() {
        let settings = ProfileSettings::default();
        let json = serde_json::to_string(&settings).unwrap();
        let deserialized: ProfileSettings = serde_json::from_str(&json).unwrap();

        assert_eq!(settings.course.id, deserialized.course.id);
        assert_eq!(settings.course.name, deserialized.course.name);
    }

    #[test]
    fn test_schema_generation() {
        let schema = SettingsManager::get_schema();
        assert!(schema.is_ok());
        let schema_value = schema.unwrap();
        assert!(schema_value.is_object());
    }
}
