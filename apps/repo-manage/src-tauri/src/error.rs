//! Unified error type for Tauri commands
//!
//! All Tauri commands return `Result<T, AppError>` for consistent error handling.
//! Error types from repo-manage-core convert to AppError via From traits.

use repo_manage_core::{ConfigError, LmsError, PlatformError};
use serde::Serialize;

/// Unified error type for all Tauri commands
#[derive(Debug, Serialize, specta::Type)]
pub struct AppError {
    /// User-friendly error message
    pub message: String,
    /// Optional technical details for debugging
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl AppError {
    /// Create a new AppError with just a message
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            details: None,
        }
    }

    /// Create a new AppError with message and details
    pub fn with_details(message: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            details: Some(details.into()),
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl From<ConfigError> for AppError {
    fn from(e: ConfigError) -> Self {
        use repo_manage_core::Interface;
        Self {
            message: e.user_message(Interface::GUI),
            details: Some(e.to_string()),
        }
    }
}

impl From<PlatformError> for AppError {
    fn from(e: PlatformError) -> Self {
        let message = match &e {
            PlatformError::NotFound(msg) => format!("Not found: {}", msg),
            PlatformError::ServiceNotFound(msg) => format!("Service unavailable: {}", msg),
            PlatformError::BadCredentials(msg) => format!("Authentication failed: {}", msg),
            PlatformError::InvalidUrl(msg) => format!("Invalid URL: {}", msg),
            PlatformError::FileError(msg) => format!("File error: {}", msg),
            PlatformError::NetworkError(_) => "Network error. Check your connection.".to_string(),
            PlatformError::GitError(_) => "Git operation failed.".to_string(),
            PlatformError::Unexpected(msg) => format!("Unexpected error: {}", msg),
            PlatformError::Other(msg) => msg.clone(),
        };
        Self {
            message,
            details: Some(e.to_string()),
        }
    }
}

impl From<LmsError> for AppError {
    fn from(e: LmsError) -> Self {
        let message = match &e {
            LmsError::HttpError(_) => "Network request failed. Check your connection.".to_string(),
            LmsError::ApiError { status, message } => {
                format!("API error ({}): {}", status, message)
            }
            LmsError::AuthError(msg) => format!("Authentication failed: {}", msg),
            LmsError::NotFound(msg) => format!("Not found: {}", msg),
            LmsError::InvalidRequest(msg) => format!("Invalid request: {}", msg),
            LmsError::RateLimitExceeded { retry_after } => {
                format!(
                    "Rate limited. Retry after {} seconds.",
                    retry_after.unwrap_or(60)
                )
            }
            LmsError::SerializationError(_) => "Failed to parse response data.".to_string(),
            LmsError::TokenStorageError(msg) => format!("Token storage error: {}", msg),
            LmsError::InvalidUrl(_) => "Invalid URL format.".to_string(),
            LmsError::IoError(_) => "File operation failed.".to_string(),
            LmsError::Other(msg) => msg.clone(),
        };
        Self {
            message,
            details: Some(e.to_string()),
        }
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        Self::new(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        Self::new(s)
    }
}
