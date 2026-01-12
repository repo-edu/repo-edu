use super::GitConnection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// CLI-specific configuration (extends GitConnection)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CLIConfig {
    /// Git settings shared with GUI
    #[serde(flatten)]
    pub git: GitConnection,

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
            git: GitConnection::default(),
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
    /// Create a new CLI config from git settings
    pub fn from_git(git: GitConnection) -> Self {
        Self {
            git,
            ..Default::default()
        }
    }

    /// Extract the git settings
    pub fn into_git(self) -> GitConnection {
        self.git
    }

    /// Get a reference to the git settings
    pub fn git(&self) -> &GitConnection {
        &self.git
    }

    /// Get a mutable reference to the git settings
    pub fn git_mut(&mut self) -> &mut GitConnection {
        &mut self.git
    }

    /// Merge CLI arguments with loaded configuration
    ///
    /// CLI arguments take precedence over loaded configuration.
    pub fn merge_with(&mut self, _other: &CLIConfig) {
        // This is a placeholder - implement field-by-field merging based on which fields are set
        // For now, just replace non-default git fields
        // In a real implementation, you'd check which fields were explicitly set via CLI
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
    fn test_cli_config_from_git() {
        let git = GitConnection::default();
        let cli_config = CLIConfig::from_git(git.clone());
        assert_eq!(cli_config.git.server_type, git.server_type);
    }

    #[test]
    fn test_cli_config_into_git() {
        let cli_config = CLIConfig::default();
        let git = cli_config.into_git();
        assert_eq!(git.server_type, GitConnection::default().server_type);
    }

    #[test]
    fn test_cli_config_accessors() {
        let mut cli_config = CLIConfig::default();

        // Test immutable access (default is GitHub)
        let git_ref = cli_config.git();
        assert_eq!(git_ref.server_type, crate::GitServerType::GitHub);

        // Test mutable access
        cli_config.git_mut().connection.base_url = Some("https://custom.url".to_string());
        assert_eq!(
            cli_config.git.connection.base_url.as_deref(),
            Some("https://custom.url")
        );
    }

    #[test]
    fn test_cli_config_serialization() {
        let config = CLIConfig::default();

        // CLI-only fields should be skipped during serialization
        let json = serde_json::to_string(&config).unwrap();
        assert!(!json.contains("reset_file"));
        assert!(!json.contains("save"));
        assert!(!json.contains("show_settings"));

        // Git fields should be included
        assert!(json.contains("server_type"));
    }
}
