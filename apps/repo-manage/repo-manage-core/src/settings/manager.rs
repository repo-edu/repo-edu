use super::atomic::atomic_write_json;
use super::error::{ConfigError, ConfigResult};
use super::gui::GuiSettings;
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
        fs::create_dir_all(&config_dir).map_err(|e| {
            ConfigError::CreateDirError {
                path: config_dir.clone(),
                source: e,
            }
        })?;

        Ok(Self {
            config_dir,
        })
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
        if let Some(proj_dirs) = directories::ProjectDirs::from("", "", "repobee-tauri") {
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
                .join("repobee-tauri")
        } else if cfg!(target_os = "windows") {
            dirs::config_dir()
                .ok_or_else(|| ConfigError::ConfigDirError {
                    message: "Could not find config directory".to_string(),
                })?
                .join("repobee-tauri")
        } else {
            // Linux and other Unix-like systems
            dirs::config_dir()
                .ok_or_else(|| ConfigError::ConfigDirError {
                    message: "Could not find config directory".to_string(),
                })?
                .join("repobee-tauri")
        };

        Ok(config_dir)
    }

    /// Validate JSON data against GuiSettings schema
    fn validate_settings(&self, json_value: &Value) -> ConfigResult<Vec<String>> {
        // Generate schema for GuiSettings
        let schema = schema_for!(GuiSettings);
        let schema_json = serde_json::to_value(&schema)
            .map_err(|e| ConfigError::SchemaSerializationError { source: e })?;

        // Compile the schema
        let compiled = jsonschema::JSONSchema::compile(&schema_json)
            .map_err(|e| ConfigError::SchemaCompileError {
                message: e.to_string(),
            })?;

        // Validate the JSON
        let mut errors = Vec::new();
        if let Err(validation_errors) = compiled.validate(json_value) {
            for error in validation_errors {
                errors.push(format!("{} at {}", error, error.instance_path));
            }
        }

        Ok(errors)
    }

    /// Load settings from disk
    /// Returns default settings if file doesn't exist (no error)
    pub fn load(&self) -> ConfigResult<GuiSettings> {
        let settings_file = self.settings_file_path();

        if !settings_file.exists() {
            // File doesn't exist, return defaults silently
            return Ok(GuiSettings::default());
        }

        let contents = fs::read_to_string(&settings_file).map_err(|e| ConfigError::ReadError {
            path: settings_file.clone(),
            source: e,
        })?;

        // Parse as generic JSON first
        let json_value: Value =
            serde_json::from_str(&contents).map_err(|e| ConfigError::JsonParseError {
                path: settings_file.clone(),
                source: e,
            })?;

        // Validate against schema
        let validation_errors = self.validate_settings(&json_value)?;
        if !validation_errors.is_empty() {
            return Err(ConfigError::ValidationError {
                errors: validation_errors,
            });
        }

        // Deserialize to GuiSettings
        let mut settings: GuiSettings =
            serde_json::from_value(json_value).map_err(|e| ConfigError::JsonParseError {
                path: settings_file,
                source: e,
            })?;

        // Normalize the settings
        settings.normalize();

        // Validate the settings
        settings.validate()?;

        Ok(settings)
    }

    /// Save settings to disk
    pub fn save(&self, settings: &GuiSettings) -> ConfigResult<()> {
        // Validate settings before saving
        settings.validate()?;

        let json_value = serde_json::to_value(settings).map_err(|e| ConfigError::JsonParseError {
            path: self.settings_file_path().to_path_buf(),
            source: e,
        })?;

        let validation_errors = self.validate_settings(&json_value)?;
        if !validation_errors.is_empty() {
            return Err(ConfigError::ValidationError {
                errors: validation_errors,
            });
        }

        let settings_file = self.settings_file_path();

        // Use atomic write for safety
        atomic_write_json(&settings_file, settings)?;

        Ok(())
    }

    /// Save settings to a specific file
    pub fn save_to(&self, settings: &GuiSettings, path: &Path) -> ConfigResult<()> {
        // Validate settings before saving
        settings.validate()?;

        let json_value = serde_json::to_value(settings).map_err(|e| ConfigError::JsonParseError {
            path: path.to_path_buf(),
            source: e,
        })?;

        let validation_errors = self.validate_settings(&json_value)?;
        if !validation_errors.is_empty() {
            return Err(ConfigError::ValidationError {
                errors: validation_errors,
            });
        }

        // Use atomic write for safety
        atomic_write_json(path, settings)?;

        Ok(())
    }

    /// Load settings from a specific file
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

        let validation_errors = self.validate_settings(&json_value)?;
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
        settings.validate()?;

        Ok(settings)
    }

    /// Get the JSON Schema for GuiSettings
    pub fn get_schema() -> ConfigResult<Value> {
        let schema = schema_for!(GuiSettings);
        serde_json::to_value(&schema).map_err(|e| ConfigError::SchemaSerializationError { source: e })
    }

    /// Reset settings to defaults
    pub fn reset(&self) -> ConfigResult<GuiSettings> {
        let settings = GuiSettings::default();
        self.save(&settings)?;
        Ok(settings)
    }

    /// Get the path to the settings file
    pub fn settings_file_path(&self) -> PathBuf {
        self.config_dir.join("repobee.json")
    }

    /// Get the config directory path
    pub fn config_dir_path(&self) -> &PathBuf {
        &self.config_dir
    }

    /// Check if settings file exists
    pub fn settings_exist(&self) -> bool {
        self.settings_file_path().exists()
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

        Ok(Some(content.trim().to_string()))
    }

    /// Set the active profile
    pub fn set_active_profile(&self, name: &str) -> ConfigResult<()> {
        let active_file = self.active_profile_file();
        fs::write(&active_file, name).map_err(|e| ConfigError::WriteError {
            path: active_file,
            source: e,
        })
    }

    /// Load a profile by name
    pub fn load_profile(&self, name: &str) -> ConfigResult<GuiSettings> {
        self.ensure_profiles_dir()?;
        let profile_path = self.profiles_dir().join(format!("{}.json", name));

        if !profile_path.exists() {
            return Err(ConfigError::FileNotFound {
                path: profile_path,
            });
        }

        let contents = fs::read_to_string(&profile_path).map_err(|e| ConfigError::ReadError {
            path: profile_path.clone(),
            source: e,
        })?;

        let json_value: serde_json::Value = serde_json::from_str(&contents)
            .map_err(|e| ConfigError::JsonParseError {
                path: profile_path.clone(),
                source: e,
            })?;

        let validation_errors = self.validate_settings(&json_value)?;
        if !validation_errors.is_empty() {
            return Err(ConfigError::ValidationError {
                errors: validation_errors,
            });
        }

        let mut settings: GuiSettings = serde_json::from_value(json_value)
            .map_err(|e| ConfigError::JsonParseError {
                path: profile_path,
                source: e,
            })?;

        settings.normalize();
        settings.validate()?;

        // Set as active profile
        self.set_active_profile(name)?;

        Ok(settings)
    }

    /// Save current settings as a named profile
    pub fn save_profile(&self, name: &str, settings: &GuiSettings) -> ConfigResult<()> {
        settings.validate()?;
        self.ensure_profiles_dir()?;

        let profile_path = self.profiles_dir().join(format!("{}.json", name));
        atomic_write_json(&profile_path, settings)?;

        // Set as active profile
        self.set_active_profile(name)?;

        Ok(())
    }

    /// Delete a profile by name
    pub fn delete_profile(&self, name: &str) -> ConfigResult<()> {
        let profile_path = self.profiles_dir().join(format!("{}.json", name));

        if !profile_path.exists() {
            return Err(ConfigError::FileNotFound {
                path: profile_path,
            });
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
            return Err(ConfigError::FileNotFound {
                path: old_path,
            });
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
}

impl Default for SettingsManager {
    fn default() -> Self {
        Self::new().expect("Failed to create SettingsManager")
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
        assert!(config_dir.to_string_lossy().contains("repobee-tauri"));
    }

    #[test]
    fn test_default_settings() {
        let settings = GuiSettings::default();
        assert_eq!(settings.common.lms_base_url, "https://canvas.tue.nl");
        assert_eq!(settings.common.git_base_url, "https://gitlab.tue.nl");
        assert_eq!(settings.active_tab, crate::settings::ActiveTab::Lms);
    }

    #[test]
    fn test_serialize_deserialize() {
        let settings = GuiSettings::default();
        let json = serde_json::to_string(&settings).unwrap();
        let deserialized: GuiSettings = serde_json::from_str(&json).unwrap();

        assert_eq!(settings.common.lms_base_url, deserialized.common.lms_base_url);
        assert_eq!(settings.active_tab, deserialized.active_tab);
    }

    #[test]
    fn test_schema_generation() {
        let schema = SettingsManager::get_schema();
        assert!(schema.is_ok());
        let schema_value = schema.unwrap();
        assert!(schema_value.is_object());
    }

    #[test]
    fn test_valid_settings_validation() {
        let manager = SettingsManager::new().unwrap();
        let settings = GuiSettings::default();
        let json_value = serde_json::to_value(&settings).unwrap();

        let errors = manager.validate_settings(&json_value).unwrap();
        assert!(errors.is_empty(), "Default settings should be valid");
    }

    #[test]
    fn test_invalid_settings_validation() {
        let manager = SettingsManager::new().unwrap();

        // Create invalid JSON with wrong types
        let invalid_json = serde_json::json!({
            "common": {
                "lms_base_url": 12345,  // Should be string
                "log_info": "not a boolean"  // Should be boolean
            },
            "active_tab": "canvas",
            "window_width": "not a number"  // Should be number
        });

        let errors = manager.validate_settings(&invalid_json).unwrap();
        assert!(
            !errors.is_empty(),
            "Invalid settings should produce validation errors"
        );
    }

    // Note: Tests for save, save_to, and load_from behavior are omitted
    // because they require file system access to the user's config directory,
    // which causes permission issues in unit tests.
}
