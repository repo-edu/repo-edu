use super::common::CommonSettings;
use super::error::{ConfigError, ConfigResult};
use super::gui::GuiSettings;
use chrono::NaiveDate;
use std::path::Path;

/// Validation errors collection
#[derive(Debug, Default)]
pub struct ValidationErrors {
    errors: Vec<String>,
}

impl ValidationErrors {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, error: String) {
        self.errors.push(error);
    }

    pub fn add_field(&mut self, field: &str, message: &str) {
        self.errors.push(format!("{}: {}", field, message));
    }

    pub fn is_empty(&self) -> bool {
        self.errors.is_empty()
    }

    pub fn into_result<T>(self, value: T) -> ConfigResult<T> {
        if self.errors.is_empty() {
            Ok(value)
        } else {
            Err(ConfigError::InvalidConfig {
                errors: self.errors,
            })
        }
    }
}

/// Trait for types that can be validated
pub trait Validate {
    fn validate(&self) -> ConfigResult<()>;
}

impl Validate for CommonSettings {
    fn validate(&self) -> ConfigResult<()> {
        let mut errors = ValidationErrors::new();

        // Validate LMS settings
        if !self.lms_base_url.is_empty() && !is_valid_url(&self.lms_base_url) {
            errors.add_field("lms_base_url", "must be a valid URL");
        }

        if !self.lms_custom_url.is_empty() && !is_valid_url(&self.lms_custom_url) {
            errors.add_field("lms_custom_url", "must be a valid URL");
        }

        // Validate Git settings
        if !self.git_base_url.is_empty() && !is_valid_url(&self.git_base_url) {
            errors.add_field("git_base_url", "must be a valid URL");
        }

        errors.into_result(())
    }
}

impl Validate for GuiSettings {
    fn validate(&self) -> ConfigResult<()> {
        let mut errors = ValidationErrors::new();

        // Validate common settings
        if let Err(ConfigError::InvalidConfig {
            errors: common_errors,
        }) = self.common.validate()
        {
            for error in common_errors {
                errors.add(error);
            }
        }

        // Validate GUI-specific settings (no constraints for current fields)

        errors.into_result(())
    }
}

/// Validate a URL string
fn is_valid_url(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://")
}

/// Validate a date string in YYYY-MM-DD format
pub fn validate_date(date_str: &str) -> ConfigResult<()> {
    if date_str.is_empty() {
        return Ok(());
    }

    NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| ConfigError::DateValidationError {
            field: "date".to_string(),
            message: format!("Invalid date format: {}. Expected YYYY-MM-DD", date_str),
        })
}

/// Validate date range (since must be before until)
pub fn validate_date_range(since: &str, until: &str) -> ConfigResult<()> {
    if since.is_empty() || until.is_empty() {
        return Ok(());
    }

    validate_date(since)?;
    validate_date(until)?;

    let since_date = NaiveDate::parse_from_str(since, "%Y-%m-%d")
        .map_err(|_| ConfigError::DateValidationError {
            field: "since".to_string(),
            message: format!("Invalid date format: {}", since),
        })?;

    let until_date = NaiveDate::parse_from_str(until, "%Y-%m-%d")
        .map_err(|_| ConfigError::DateValidationError {
            field: "until".to_string(),
            message: format!("Invalid date format: {}", until),
        })?;

    if since_date >= until_date {
        return Err(ConfigError::DateValidationError {
            field: "since/until".to_string(),
            message: "'since' date must be before 'until' date".to_string(),
        });
    }

    Ok(())
}

/// Path validation options
#[derive(Debug, Clone, Copy)]
pub enum PathValidationMode {
    /// Path must exist
    MustExist,
    /// Path is optional (warn if doesn't exist)
    Optional,
    /// Path must be writable
    MustBeWritable,
}

/// Validate a file path
pub fn validate_path(path: &Path, mode: PathValidationMode) -> ConfigResult<()> {
    match mode {
        PathValidationMode::MustExist => {
            if !path.exists() {
                return Err(ConfigError::PathValidationError {
                    path: path.to_path_buf(),
                    message: "Path does not exist".to_string(),
                });
            }
        }
        PathValidationMode::Optional => {
            // No error, just skip validation
        }
        PathValidationMode::MustBeWritable => {
            // Check parent directory exists and is writable
            if let Some(parent) = path.parent() {
                if !parent.exists() {
                    return Err(ConfigError::PathValidationError {
                        path: path.to_path_buf(),
                        message: "Parent directory does not exist".to_string(),
                    });
                }

                // Try to check write permissions
                let metadata = parent.metadata().map_err(|e| ConfigError::PathValidationError {
                    path: path.to_path_buf(),
                    message: format!("Cannot access parent directory: {}", e),
                })?;

                if metadata.permissions().readonly() {
                    return Err(ConfigError::PathValidationError {
                        path: path.to_path_buf(),
                        message: "Parent directory is not writable".to_string(),
                    });
                }
            }
        }
    }

    Ok(())
}

/// Validate a glob pattern
pub fn validate_glob_pattern(pattern: &str) -> ConfigResult<()> {
    glob::Pattern::new(pattern).map(|_| ()).map_err(|e| ConfigError::ValueValidationError {
        field: "glob_pattern".to_string(),
        message: format!("Invalid glob pattern: {}", e),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    // ===== Date Validation Tests =====

    #[test]
    fn test_validate_date_valid_formats() {
        assert!(validate_date("2025-11-21").is_ok());
        assert!(validate_date("2025-01-01").is_ok());
        assert!(validate_date("2025-12-31").is_ok());
        assert!(validate_date("2000-02-29").is_ok()); // Leap year
        assert!(validate_date("").is_ok()); // Empty is ok
    }

    #[test]
    fn test_validate_date_invalid_formats() {
        assert!(validate_date("invalid").is_err());
        assert!(validate_date("2025/11/21").is_err()); // Wrong separator
        assert!(validate_date("11-21-2025").is_err()); // Wrong order
        assert!(validate_date("2025-13-01").is_err()); // Invalid month
        assert!(validate_date("2025-11-32").is_err()); // Invalid day
        assert!(validate_date("2025-00-01").is_err()); // Invalid month
        assert!(validate_date("2025-11-00").is_err()); // Invalid day
        assert!(validate_date("2001-02-29").is_err()); // Not a leap year
    }

    #[test]
    fn test_validate_date_edge_cases() {
        assert!(validate_date("9999-12-31").is_ok());
        assert!(validate_date("0000-01-01").is_ok());
        // Note: chrono accepts non-zero-padded dates
        assert!(validate_date("2025-2-5").is_ok());
        assert!(validate_date("2025-02-05").is_ok());
    }

    #[test]
    fn test_validate_date_range_valid() {
        assert!(validate_date_range("2025-01-01", "2025-12-31").is_ok());
        assert!(validate_date_range("2025-01-01", "2025-01-02").is_ok());
        assert!(validate_date_range("2024-12-31", "2025-01-01").is_ok());
        assert!(validate_date_range("", "").is_ok()); // Empty is ok
        assert!(validate_date_range("2025-01-01", "").is_ok()); // Partial is ok
        assert!(validate_date_range("", "2025-12-31").is_ok()); // Partial is ok
    }

    #[test]
    fn test_validate_date_range_invalid() {
        assert!(validate_date_range("2025-12-31", "2025-01-01").is_err()); // since after until
        assert!(validate_date_range("2025-01-01", "2025-01-01").is_err()); // Equal dates
        assert!(validate_date_range("2025-06-15", "2025-06-14").is_err());
    }

    #[test]
    fn test_validate_date_range_invalid_dates() {
        assert!(validate_date_range("invalid", "2025-12-31").is_err());
        assert!(validate_date_range("2025-01-01", "invalid").is_err());
        assert!(validate_date_range("2025-13-01", "2025-12-31").is_err());
    }

    // ===== URL Validation Tests =====

    #[test]
    fn test_is_valid_url_http() {
        assert!(is_valid_url("http://example.com"));
        assert!(is_valid_url("http://example.com/path"));
        assert!(is_valid_url("http://example.com:8080"));
        assert!(is_valid_url("http://localhost"));
    }

    #[test]
    fn test_is_valid_url_https() {
        assert!(is_valid_url("https://example.com"));
        assert!(is_valid_url("https://example.com/path"));
        assert!(is_valid_url("https://example.com:443"));
        assert!(is_valid_url("https://sub.domain.example.com"));
    }

    #[test]
    fn test_is_valid_url_invalid() {
        assert!(!is_valid_url("ftp://example.com"));
        assert!(!is_valid_url("example.com"));
        assert!(!is_valid_url("www.example.com"));
        assert!(!is_valid_url(""));
        assert!(!is_valid_url("file:///path"));
        assert!(!is_valid_url("//example.com"));
    }

    // ===== Path Validation Tests =====

    #[test]
    fn test_validate_path_must_exist() {
        // Test with current directory (should exist)
        let current_dir = std::env::current_dir().unwrap();
        assert!(validate_path(&current_dir, PathValidationMode::MustExist).is_ok());

        // Test with non-existent path
        let nonexistent = PathBuf::from("/nonexistent/path/12345");
        assert!(validate_path(&nonexistent, PathValidationMode::MustExist).is_err());
    }

    #[test]
    fn test_validate_path_optional() {
        let nonexistent = PathBuf::from("/nonexistent/path");
        assert!(validate_path(&nonexistent, PathValidationMode::Optional).is_ok());
    }

    #[test]
    fn test_validate_path_must_be_writable() {
        use tempfile::TempDir;

        // Create a temporary directory
        let temp_dir = TempDir::new().unwrap();
        let writable_path = temp_dir.path().join("test.txt");

        // Should succeed because parent exists and is writable
        assert!(validate_path(&writable_path, PathValidationMode::MustBeWritable).is_ok());

        // Test with path where parent doesn't exist
        let nonexistent_parent = PathBuf::from("/nonexistent/path/file.txt");
        assert!(validate_path(&nonexistent_parent, PathValidationMode::MustBeWritable).is_err());
    }

    // ===== Glob Pattern Validation Tests =====

    #[test]
    fn test_validate_glob_pattern_valid() {
        assert!(validate_glob_pattern("*.rs").is_ok());
        assert!(validate_glob_pattern("**/*.rs").is_ok());
        assert!(validate_glob_pattern("src/**/*.{rs,toml}").is_ok());
        assert!(validate_glob_pattern("test_*.txt").is_ok());
        assert!(validate_glob_pattern("[a-z]*.rs").is_ok());
    }

    #[test]
    fn test_validate_glob_pattern_invalid() {
        assert!(validate_glob_pattern("[").is_err()); // Unclosed bracket
        assert!(validate_glob_pattern("***/").is_err()); // Invalid syntax
    }

    // ===== Settings Validation Tests =====

    #[test]
    fn test_validate_common_settings_default() {
        let settings = CommonSettings::default();
        assert!(settings.validate().is_ok());
    }

    #[test]
    fn test_validate_common_settings_invalid_lms_url() {
        let mut settings = CommonSettings::default();
        settings.lms_base_url = "invalid-url".to_string();
        assert!(settings.validate().is_err());
    }

    #[test]
    fn test_validate_common_settings_invalid_custom_url() {
        let mut settings = CommonSettings::default();
        settings.lms_custom_url = "not-a-url".to_string();
        assert!(settings.validate().is_err());
    }

    #[test]
    fn test_validate_common_settings_invalid_git_url() {
        let mut settings = CommonSettings::default();
        settings.git_base_url = "ftp://invalid".to_string();
        assert!(settings.validate().is_err());
    }

    #[test]
    fn test_validate_common_settings_multiple_errors() {
        let mut settings = CommonSettings::default();
        settings.lms_base_url = "invalid1".to_string();
        settings.git_base_url = "invalid2".to_string();

        let result = settings.validate();
        assert!(result.is_err());

        if let Err(ConfigError::InvalidConfig { errors }) = result {
            assert!(errors.len() >= 2);
        } else {
            panic!("Expected InvalidConfig error with multiple errors");
        }
    }

    #[test]
    fn test_validate_common_settings_empty_urls_ok() {
        let mut settings = CommonSettings::default();
        settings.lms_base_url = String::new();
        settings.git_base_url = String::new();
        assert!(settings.validate().is_ok());
    }

    #[test]
    fn test_validate_gui_settings_default() {
        let settings = GuiSettings::default();
        assert!(settings.validate().is_ok());
    }

    #[test]
    fn test_validate_gui_settings_with_invalid_common() {
        let mut common = CommonSettings::default();
        common.lms_base_url = "invalid".to_string();
        let settings = GuiSettings::from_common(common);
        assert!(settings.validate().is_err());
    }

    // ===== ValidationErrors Tests =====

    #[test]
    fn test_validation_errors_empty() {
        let errors = ValidationErrors::new();
        assert!(errors.is_empty());

        let result: ConfigResult<()> = errors.into_result(());
        assert!(result.is_ok());
    }

    #[test]
    fn test_validation_errors_single() {
        let mut errors = ValidationErrors::new();
        errors.add_field("field1", "error1");
        assert!(!errors.is_empty());

        let result: ConfigResult<()> = errors.into_result(());
        assert!(result.is_err());

        if let Err(ConfigError::InvalidConfig { errors }) = result {
            assert_eq!(errors.len(), 1);
            assert_eq!(errors[0], "field1: error1");
        } else {
            panic!("Expected InvalidConfig error");
        }
    }

    #[test]
    fn test_validation_errors_multiple() {
        let mut errors = ValidationErrors::new();
        errors.add_field("field1", "error1");
        errors.add_field("field2", "error2");
        errors.add("custom error".to_string());
        assert!(!errors.is_empty());

        let result: ConfigResult<()> = errors.into_result(());
        assert!(result.is_err());

        if let Err(ConfigError::InvalidConfig { errors }) = result {
            assert_eq!(errors.len(), 3);
            assert!(errors[0].contains("field1"));
            assert!(errors[1].contains("field2"));
            assert_eq!(errors[2], "custom error");
        } else {
            panic!("Expected InvalidConfig error");
        }
    }

    #[test]
    fn test_validation_errors_with_value() {
        let mut errors = ValidationErrors::new();
        errors.add_field("test", "failed");

        let result: ConfigResult<i32> = errors.into_result(42);
        assert!(result.is_err());
    }

    #[test]
    fn test_validation_errors_success_with_value() {
        let errors = ValidationErrors::new();
        let result: ConfigResult<i32> = errors.into_result(42);
        assert_eq!(result.unwrap(), 42);
    }
}
