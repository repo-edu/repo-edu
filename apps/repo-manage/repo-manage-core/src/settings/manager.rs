use super::atomic::atomic_write_json;
use super::common::ProfileSettings;
use super::error::{ConfigError, ConfigResult};
use super::gui::{AppSettings, GuiSettings, SettingsLoadResult};
use super::merge::merge_with_defaults_warned;
use super::normalization::Normalize;
use super::validation::Validate;
use schemars::schema_for;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

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

    /// Validate JSON data against GuiSettings schema
    fn validate_gui_settings(&self, json_value: &Value) -> ConfigResult<Vec<String>> {
        let schema = schema_for!(GuiSettings);
        let schema_json = serde_json::to_value(&schema)
            .map_err(|e| ConfigError::SchemaSerializationError { source: e })?;

        let validator = jsonschema::validator_for(&schema_json).map_err(|e| {
            ConfigError::SchemaCompileError {
                message: e.to_string(),
            }
        })?;

        let errors: Vec<String> = validator
            .iter_errors(json_value)
            .map(|error| {
                let path = error.instance_path().to_string();
                if path.is_empty() {
                    error.to_string()
                } else {
                    format!("{} (at {})", error, path)
                }
            })
            .collect();

        Ok(errors)
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

    // ===== Combined Settings (for frontend) =====

    /// Load combined settings (app + active profile)
    /// Returns default settings if files don't exist (no error)
    /// Creates a "Default" profile if no profiles exist
    pub fn load(&self) -> ConfigResult<GuiSettings> {
        let result = self.load_with_warnings()?;
        Ok(result.settings)
    }

    /// Load combined settings with warnings for unknown/invalid fields
    /// Returns settings with defaults applied, plus any warnings about corrected issues
    pub fn load_with_warnings(&self) -> ConfigResult<SettingsLoadResult> {
        let mut all_warnings = Vec::new();

        // Load app settings with warnings
        let (app, app_warnings) = self.load_app_settings_warned()?;
        all_warnings.extend(app_warnings.into_iter().map(|w| format!("app.json: {}", w)));

        // Ensure at least one profile exists
        self.ensure_default_profile()?;

        // Load active profile settings with warnings
        let (profile, profile_warnings) = if let Some(profile_name) = self.get_active_profile()? {
            let (p, w) = self.load_profile_settings_warned(&profile_name)?;
            let warnings = w
                .into_iter()
                .map(|w| format!("{}.json: {}", profile_name, w))
                .collect();
            (p, warnings)
        } else {
            (ProfileSettings::default(), vec![])
        };
        all_warnings.extend(profile_warnings);

        let mut settings = GuiSettings::from_parts(app, profile);
        settings.normalize();

        Ok(SettingsLoadResult {
            settings,
            warnings: all_warnings,
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

    /// Save combined settings
    /// Saves app settings to app.json and profile settings to active profile
    pub fn save(&self, settings: &GuiSettings) -> ConfigResult<()> {
        // Save app settings
        self.save_app_settings(&settings.app)?;

        // Save profile settings to active profile (if one is set)
        if let Some(profile_name) = self.get_active_profile()? {
            self.save_profile_settings(&profile_name, &settings.profile)?;
        }

        Ok(())
    }

    /// Get the JSON Schema for GuiSettings
    pub fn get_schema() -> ConfigResult<Value> {
        let schema = schema_for!(GuiSettings);
        serde_json::to_value(&schema)
            .map_err(|e| ConfigError::SchemaSerializationError { source: e })
    }

    /// Reset settings to defaults
    pub fn reset(&self) -> ConfigResult<GuiSettings> {
        let settings = GuiSettings::default();
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

    /// Load profile settings by name (ProfileSettings only, not full GuiSettings)
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
    /// Returns combined GuiSettings with the loaded profile
    pub fn load_profile(&self, name: &str) -> ConfigResult<GuiSettings> {
        let profile = self.load_profile_settings(name)?;

        // Set as active profile
        self.set_active_profile(name)?;

        // Load app settings and combine
        let app = self.load_app_settings()?;
        let mut settings = GuiSettings::from_parts(app, profile);
        settings.normalize();

        Ok(settings)
    }

    /// Save current settings as a named profile
    /// Only saves the profile settings, not app settings
    pub fn save_profile(&self, name: &str, settings: &GuiSettings) -> ConfigResult<()> {
        self.save_profile_settings(name, &settings.profile)?;

        // Set as active profile
        self.set_active_profile(name)?;

        Ok(())
    }

    /// Delete a profile by name
    pub fn delete_profile(&self, name: &str) -> ConfigResult<()> {
        let profile_path = self.profiles_dir().join(format!("{}.json", name));

        if !profile_path.exists() {
            return Err(ConfigError::FileNotFound { path: profile_path });
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

        if !old_path.exists() {
            return Err(ConfigError::FileNotFound { path: old_path });
        }

        if new_path.exists() {
            return Err(ConfigError::Other(format!(
                "Profile '{}' already exists",
                new_name
            )));
        }

        fs::rename(&old_path, &new_path).map_err(|e| ConfigError::WriteError {
            path: new_path,
            source: e,
        })?;

        // Update active profile if it was the renamed one
        if self.get_active_profile()? == Some(old_name.to_string()) {
            self.set_active_profile(new_name)?;
        }

        Ok(())
    }

    // ===== Import/Export (for full GuiSettings) =====

    /// Save settings to a specific file (for export)
    pub fn save_to(&self, settings: &GuiSettings, path: &Path) -> ConfigResult<()> {
        settings.profile.validate()?;

        let json_value =
            serde_json::to_value(settings).map_err(|e| ConfigError::JsonParseError {
                path: path.to_path_buf(),
                source: e,
            })?;

        let validation_errors = self.validate_gui_settings(&json_value)?;
        if !validation_errors.is_empty() {
            return Err(ConfigError::ValidationError {
                errors: validation_errors,
            });
        }

        atomic_write_json(path, settings)?;

        Ok(())
    }

    /// Load settings from a specific file (for import)
    pub fn load_from(&self, path: &Path) -> ConfigResult<GuiSettings> {
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

        let validation_errors = self.validate_gui_settings(&json_value)?;
        if !validation_errors.is_empty() {
            return Err(ConfigError::ValidationError {
                errors: validation_errors,
            });
        }

        let mut settings: GuiSettings =
            serde_json::from_value(json_value).map_err(|e| ConfigError::JsonParseError {
                path: path.to_path_buf(),
                source: e,
            })?;

        settings.normalize();
        settings.profile.validate()?;

        Ok(settings)
    }
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
    pub fn load_with_strategy(&self, strategy: LoadStrategy) -> ConfigResult<GuiSettings> {
        match self.load() {
            Ok(settings) => Ok(settings),
            Err(e) => match strategy {
                LoadStrategy::Strict => Err(e),
                LoadStrategy::DefaultOnError => {
                    log::warn!("Failed to load settings, using defaults: {}", e);
                    Ok(GuiSettings::default())
                }
            },
        }
    }

    /// Load settings or return defaults (never fails)
    pub fn load_or_default(&self) -> GuiSettings {
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
        let settings = GuiSettings::default();
        assert_eq!(
            settings.profile.lms.canvas.base_url,
            "https://canvas.tue.nl"
        );
        assert_eq!(
            settings.profile.git.gitlab.base_url,
            "https://gitlab.tue.nl"
        );
        assert_eq!(settings.app.active_tab, crate::settings::ActiveTab::Lms);
    }

    #[test]
    fn test_serialize_deserialize() {
        let settings = GuiSettings::default();
        let json = serde_json::to_string(&settings).unwrap();
        let deserialized: GuiSettings = serde_json::from_str(&json).unwrap();

        assert_eq!(
            settings.profile.lms.canvas.base_url,
            deserialized.profile.lms.canvas.base_url
        );
        assert_eq!(settings.app.active_tab, deserialized.app.active_tab);
    }

    #[test]
    fn test_schema_generation() {
        let schema = SettingsManager::get_schema();
        assert!(schema.is_ok());
        let schema_value = schema.unwrap();
        assert!(schema_value.is_object());
    }
}
