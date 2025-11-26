use std::path::PathBuf;
use thiserror::Error;

/// Configuration-specific errors
#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Failed to read file {path}: {source}")]
    ReadError {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("Failed to write file {path}: {source}")]
    WriteError {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("Invalid JSON in {path}: {source}")]
    JsonParseError {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },

    #[error("Schema validation failed: {errors:?}")]
    ValidationError { errors: Vec<String> },

    #[error("Configuration file not found: {path}")]
    FileNotFound { path: PathBuf },

    #[error("Invalid configuration: {errors:?}")]
    InvalidConfig { errors: Vec<String> },

    #[error("Invalid path: {path}")]
    InvalidPath { path: PathBuf },

    #[error("Path validation failed for {path}: {message}")]
    PathValidationError { path: PathBuf, message: String },

    #[error("Failed to create directory {path}: {source}")]
    CreateDirError {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("Failed to get config directory: {message}")]
    ConfigDirError { message: String },

    #[error("Value validation failed for field '{field}': {message}")]
    ValueValidationError { field: String, message: String },

    #[error("Date validation failed for field '{field}': {message}")]
    DateValidationError { field: String, message: String },

    #[error("Invalid value for {field}: expected {constraint}, got {value}")]
    InvalidValue {
        field: &'static str,
        value: String,
        constraint: &'static str,
    },

    #[error("Failed to serialize schema: {source}")]
    SchemaSerializationError {
        #[source]
        source: serde_json::Error,
    },

    #[error("Failed to compile schema: {message}")]
    SchemaCompileError { message: String },

    #[error("Failed to normalize path: {path}")]
    PathNormalizationError { path: PathBuf },

    #[error("Other error: {0}")]
    Other(String),
}

impl ConfigError {
    /// Create user-friendly error messages for different interfaces
    pub fn user_message(&self, interface: Interface) -> String {
        match (self, interface) {
            (ConfigError::FileNotFound { path }, Interface::CLI) => {
                format!(
                    "Configuration file not found: {}\n\
                     Use --save to create a new configuration file.",
                    path.display()
                )
            }
            (ConfigError::FileNotFound { .. }, Interface::GUI) => {
                "Configuration file not found. Click 'Save' to create one.".to_string()
            }
            (ConfigError::InvalidConfig { errors }, Interface::CLI) => {
                format!(
                    "Invalid configuration:\n{}",
                    errors
                        .iter()
                        .map(|e| format!("  - {}", e))
                        .collect::<Vec<_>>()
                        .join("\n")
                )
            }
            (ConfigError::InvalidConfig { errors }, Interface::GUI) => {
                format!(
                    "Invalid configuration: {}",
                    errors.join(", ")
                )
            }
            (ConfigError::ValidationError { errors }, _) => {
                format!(
                    "Validation failed:\n{}",
                    errors
                        .iter()
                        .map(|e| format!("  - {}", e))
                        .collect::<Vec<_>>()
                        .join("\n")
                )
            }
            _ => self.to_string(),
        }
    }
}

/// Interface type for context-specific error messages
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Interface {
    CLI,
    GUI,
}

/// Result type alias for configuration operations
pub type ConfigResult<T> = Result<T, ConfigError>;

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_read_error_display() {
        let error = ConfigError::ReadError {
            path: PathBuf::from("/path/to/file.json"),
            source: std::io::Error::new(std::io::ErrorKind::NotFound, "file not found"),
        };
        let message = error.to_string();
        assert!(message.contains("/path/to/file.json"));
        assert!(message.contains("Failed to read file"));
    }

    #[test]
    fn test_write_error_display() {
        let error = ConfigError::WriteError {
            path: PathBuf::from("/path/to/file.json"),
            source: std::io::Error::new(std::io::ErrorKind::PermissionDenied, "permission denied"),
        };
        let message = error.to_string();
        assert!(message.contains("/path/to/file.json"));
        assert!(message.contains("Failed to write file"));
    }

    #[test]
    fn test_validation_error_display() {
        let error = ConfigError::ValidationError {
            errors: vec!["Error 1".to_string(), "Error 2".to_string()],
        };
        let message = error.to_string();
        assert!(message.contains("Schema validation failed"));
    }

    #[test]
    fn test_invalid_config_display() {
        let error = ConfigError::InvalidConfig {
            errors: vec!["field1: invalid".to_string(), "field2: missing".to_string()],
        };
        let message = error.to_string();
        assert!(message.contains("Invalid configuration"));
    }

    #[test]
    fn test_file_not_found_display() {
        let error = ConfigError::FileNotFound {
            path: PathBuf::from("/nonexistent/config.json"),
        };
        let message = error.to_string();
        assert!(message.contains("Configuration file not found"));
        assert!(message.contains("/nonexistent/config.json"));
    }

    #[test]
    fn test_value_validation_error_display() {
        let error = ConfigError::ValueValidationError {
            field: "timeout".to_string(),
            message: "must be positive".to_string(),
        };
        let message = error.to_string();
        assert!(message.contains("timeout"));
        assert!(message.contains("must be positive"));
    }

    #[test]
    fn test_user_message_cli_file_not_found() {
        let error = ConfigError::FileNotFound {
            path: PathBuf::from("/path/to/config.json"),
        };
        let message = error.user_message(Interface::CLI);
        assert!(message.contains("--save"));
        assert!(message.contains("/path/to/config.json"));
    }

    #[test]
    fn test_user_message_gui_file_not_found() {
        let error = ConfigError::FileNotFound {
            path: PathBuf::from("/path/to/config.json"),
        };
        let message = error.user_message(Interface::GUI);
        assert!(message.contains("Save"));
        assert!(!message.contains("--save")); // CLI-specific instruction should not be there
    }

    #[test]
    fn test_user_message_cli_invalid_config() {
        let error = ConfigError::InvalidConfig {
            errors: vec!["Error 1".to_string(), "Error 2".to_string()],
        };
        let message = error.user_message(Interface::CLI);
        assert!(message.contains("Invalid configuration"));
        assert!(message.contains("  - Error 1"));
        assert!(message.contains("  - Error 2"));
    }

    #[test]
    fn test_user_message_gui_invalid_config() {
        let error = ConfigError::InvalidConfig {
            errors: vec!["Error 1".to_string(), "Error 2".to_string()],
        };
        let message = error.user_message(Interface::GUI);
        assert!(message.contains("Invalid configuration"));
        assert!(message.contains("Error 1"));
        assert!(message.contains("Error 2"));
        assert!(!message.contains("  - ")); // No CLI-style formatting
    }

    #[test]
    fn test_user_message_validation_error() {
        let error = ConfigError::ValidationError {
            errors: vec!["Field error 1".to_string(), "Field error 2".to_string()],
        };
        let cli_message = error.user_message(Interface::CLI);
        let gui_message = error.user_message(Interface::GUI);

        assert_eq!(cli_message, gui_message); // Should be same for both interfaces
        assert!(cli_message.contains("Validation failed"));
    }

    #[test]
    fn test_config_error_from_io_error() {
        let path = PathBuf::from("/test/path.json");
        let io_error = std::io::Error::new(std::io::ErrorKind::NotFound, "not found");

        let config_error = ConfigError::ReadError {
            path: path.clone(),
            source: io_error,
        };

        assert!(matches!(config_error, ConfigError::ReadError { .. }));
    }

    #[test]
    fn test_path_validation_error() {
        let error = ConfigError::PathValidationError {
            path: PathBuf::from("/invalid/path"),
            message: "Path does not exist".to_string(),
        };
        let message = error.to_string();
        assert!(message.contains("/invalid/path"));
        assert!(message.contains("Path does not exist"));
    }

    #[test]
    fn test_date_validation_error() {
        let error = ConfigError::DateValidationError {
            field: "start_date".to_string(),
            message: "Invalid format".to_string(),
        };
        let message = error.to_string();
        assert!(message.contains("start_date"));
        assert!(message.contains("Invalid format"));
    }
}
