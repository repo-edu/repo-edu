use super::common::CommonSettings;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// CLI-specific configuration (extends CommonSettings)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CLIConfig {
    /// Common settings shared with GUI
    #[serde(flatten)]
    pub common: CommonSettings,

    // ===== CLI-Only Options =====
    /// Reset settings file location to default
    #[serde(skip)]
    pub reset_file: bool,

    /// Load settings from a specific file
    #[serde(skip)]
    pub load_path: Option<PathBuf>,

    /// Reset settings to defaults
    #[serde(skip)]
    pub reset_defaults: bool,

    /// Save current settings to file
    #[serde(skip)]
    pub save: bool,

    /// Save settings to a specific file
    #[serde(skip)]
    pub save_as: Option<PathBuf>,

    /// Show current settings
    #[serde(skip)]
    pub show_settings: bool,

    /// Run the application (vs just saving/loading settings)
    #[serde(skip)]
    pub run: bool,
}

impl Default for CLIConfig {
    fn default() -> Self {
        Self {
            common: CommonSettings::default(),
            reset_file: false,
            load_path: None,
            reset_defaults: false,
            save: false,
            save_as: None,
            show_settings: false,
            run: true,
        }
    }
}

impl CLIConfig {
    /// Create a new CLI config from common settings
    pub fn from_common(common: CommonSettings) -> Self {
        Self {
            common,
            ..Default::default()
        }
    }

    /// Extract the common settings
    pub fn into_common(self) -> CommonSettings {
        self.common
    }

    /// Get a reference to the common settings
    pub fn common(&self) -> &CommonSettings {
        &self.common
    }

    /// Get a mutable reference to the common settings
    pub fn common_mut(&mut self) -> &mut CommonSettings {
        &mut self.common
    }

    /// Merge CLI arguments with loaded configuration
    ///
    /// CLI arguments take precedence over loaded configuration.
    pub fn merge_with(&mut self, _other: &CLIConfig) {
        // This is a placeholder - implement field-by-field merging based on which fields are set
        // For now, just replace non-default common fields
        // In a real implementation, you'd check which fields were explicitly set via CLI
    }
}

/// CLI argument parsing helper
///
/// This trait helps convert CLI arguments to configuration updates
pub trait CLIOverride {
    /// Check if this CLI argument should override the config value
    fn should_override(&self) -> bool;

    /// Apply this CLI argument to the configuration
    fn apply_to(&self, config: &mut CommonSettings);
}

// Example implementation for optional string fields
impl CLIOverride for Option<String> {
    fn should_override(&self) -> bool {
        self.is_some()
    }

    fn apply_to(&self, _config: &mut CommonSettings) {
        // Field-specific logic would go here
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cli_config_default() {
        let config = CLIConfig::default();
        assert!(!config.reset_file);
        assert!(!config.save);
        assert!(config.run);
        assert!(config.load_path.is_none());
    }

    #[test]
    fn test_cli_config_from_common() {
        let common = CommonSettings::default();
        let cli_config = CLIConfig::from_common(common.clone());
        assert_eq!(cli_config.common.lms_base_url, common.lms_base_url);
    }

    #[test]
    fn test_cli_config_into_common() {
        let cli_config = CLIConfig::default();
        let common = cli_config.into_common();
        assert_eq!(common.lms_base_url, CommonSettings::default().lms_base_url);
    }

    #[test]
    fn test_cli_config_accessors() {
        let mut cli_config = CLIConfig::default();

        // Test immutable access
        let common_ref = cli_config.common();
        assert_eq!(common_ref.lms_base_url, "https://canvas.tue.nl");

        // Test mutable access
        cli_config.common_mut().lms_base_url = "https://custom.url".to_string();
        assert_eq!(cli_config.common.lms_base_url, "https://custom.url");
    }

    #[test]
    fn test_cli_config_serialization() {
        let config = CLIConfig::default();

        // CLI-only fields should be skipped during serialization
        let json = serde_json::to_string(&config).unwrap();
        assert!(!json.contains("reset_file"));
        assert!(!json.contains("save"));
        assert!(!json.contains("show_settings"));

        // Common fields should be included
        assert!(json.contains("lms_base_url"));
    }
}
