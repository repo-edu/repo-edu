use super::error::{ConfigError, ConfigResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Location file structure
/// Tracks which settings file is currently active
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsLocation {
    pub settings_location: PathBuf,
}

impl SettingsLocation {
    /// Create a new settings location
    pub fn new(settings_location: PathBuf) -> Self {
        Self { settings_location }
    }

    /// Load settings location from file
    pub fn load(location_file: &Path) -> ConfigResult<Self> {
        if !location_file.exists() {
            return Err(ConfigError::FileNotFound {
                path: location_file.to_path_buf(),
            });
        }

        let contents = fs::read_to_string(location_file).map_err(|e| ConfigError::ReadError {
            path: location_file.to_path_buf(),
            source: e,
        })?;

        let location: SettingsLocation =
            serde_json::from_str(&contents).map_err(|e| ConfigError::JsonParseError {
                path: location_file.to_path_buf(),
                source: e,
            })?;

        Ok(location)
    }

    /// Save settings location to file
    pub fn save(&self, location_file: &Path) -> ConfigResult<()> {
        // Ensure parent directory exists
        if let Some(parent) = location_file.parent() {
            fs::create_dir_all(parent).map_err(|e| ConfigError::CreateDirError {
                path: parent.to_path_buf(),
                source: e,
            })?;
        }

        let json = serde_json::to_string_pretty(self).map_err(|e| ConfigError::JsonParseError {
            path: location_file.to_path_buf(),
            source: e,
        })?;

        fs::write(location_file, json).map_err(|e| ConfigError::WriteError {
            path: location_file.to_path_buf(),
            source: e,
        })?;

        Ok(())
    }

    /// Load or create default settings location
    pub fn load_or_create_default(
        location_file: &Path,
        default_settings_file: &Path,
    ) -> ConfigResult<Self> {
        match Self::load(location_file) {
            Ok(location) => Ok(location),
            Err(ConfigError::FileNotFound { .. }) => {
                // Create default location file
                let location = Self::new(default_settings_file.to_path_buf());
                location.save(location_file)?;
                Ok(location)
            }
            Err(e) => Err(e),
        }
    }

    /// Get the settings file path
    pub fn settings_path(&self) -> &Path {
        &self.settings_location
    }
}

/// Location file manager
pub struct LocationManager {
    location_file: PathBuf,
    default_settings_file: PathBuf,
}

impl LocationManager {
    /// Create a new location manager
    pub fn new(config_dir: &Path, app_name: &str) -> Self {
        let location_file = config_dir.join(format!("{}-location.json", app_name));
        let default_settings_file = config_dir.join(format!("{}.json", app_name));

        Self {
            location_file,
            default_settings_file,
        }
    }

    /// Get the location file path
    pub fn location_file_path(&self) -> &Path {
        &self.location_file
    }

    /// Get the default settings file path
    pub fn default_settings_file_path(&self) -> &Path {
        &self.default_settings_file
    }

    /// Load the current settings location
    pub fn load(&self) -> ConfigResult<SettingsLocation> {
        SettingsLocation::load_or_create_default(&self.location_file, &self.default_settings_file)
    }

    /// Save a new settings location
    pub fn save(&self, settings_path: &Path) -> ConfigResult<()> {
        let location = SettingsLocation::new(settings_path.to_path_buf());
        location.save(&self.location_file)
    }

    /// Reset to default settings location
    pub fn reset(&self) -> ConfigResult<()> {
        self.save(&self.default_settings_file)
    }

    /// Check if location file exists
    pub fn exists(&self) -> bool {
        self.location_file.exists()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_settings_location_new() {
        let path = PathBuf::from("/path/to/settings.json");
        let location = SettingsLocation::new(path.clone());
        assert_eq!(location.settings_path(), path.as_path());
    }

    #[test]
    fn test_settings_location_save_and_load() {
        let temp_dir = TempDir::new().unwrap();
        let location_file = temp_dir.path().join("location.json");
        let settings_path = PathBuf::from("/path/to/settings.json");

        let location = SettingsLocation::new(settings_path.clone());
        location.save(&location_file).unwrap();

        let loaded = SettingsLocation::load(&location_file).unwrap();
        assert_eq!(loaded.settings_path(), settings_path.as_path());
    }

    #[test]
    fn test_settings_location_load_missing() {
        let location_file = PathBuf::from("/nonexistent/location.json");
        let result = SettingsLocation::load(&location_file);
        assert!(matches!(result, Err(ConfigError::FileNotFound { .. })));
    }

    #[test]
    fn test_settings_location_load_or_create_default() {
        let temp_dir = TempDir::new().unwrap();
        let location_file = temp_dir.path().join("location.json");
        let default_settings = temp_dir.path().join("settings.json");

        let location =
            SettingsLocation::load_or_create_default(&location_file, &default_settings).unwrap();

        assert_eq!(location.settings_path(), default_settings.as_path());
        assert!(location_file.exists());
    }

    #[test]
    fn test_location_manager_new() {
        let temp_dir = TempDir::new().unwrap();
        let manager = LocationManager::new(temp_dir.path(), "test-app");

        assert_eq!(
            manager.location_file_path(),
            temp_dir.path().join("test-app-location.json")
        );
        assert_eq!(
            manager.default_settings_file_path(),
            temp_dir.path().join("test-app.json")
        );
    }

    #[test]
    fn test_location_manager_load_creates_default() {
        let temp_dir = TempDir::new().unwrap();
        let manager = LocationManager::new(temp_dir.path(), "test-app");

        let location = manager.load().unwrap();
        assert_eq!(location.settings_path(), manager.default_settings_file_path());
        assert!(manager.exists());
    }

    #[test]
    fn test_location_manager_save() {
        let temp_dir = TempDir::new().unwrap();
        let manager = LocationManager::new(temp_dir.path(), "test-app");
        let custom_path = temp_dir.path().join("custom.json");

        manager.save(&custom_path).unwrap();

        let location = manager.load().unwrap();
        assert_eq!(location.settings_path(), custom_path.as_path());
    }

    #[test]
    fn test_location_manager_reset() {
        let temp_dir = TempDir::new().unwrap();
        let manager = LocationManager::new(temp_dir.path(), "test-app");
        let custom_path = temp_dir.path().join("custom.json");

        // Set custom path
        manager.save(&custom_path).unwrap();
        let location = manager.load().unwrap();
        assert_eq!(location.settings_path(), custom_path.as_path());

        // Reset to default
        manager.reset().unwrap();
        let location = manager.load().unwrap();
        assert_eq!(location.settings_path(), manager.default_settings_file_path());
    }
}
