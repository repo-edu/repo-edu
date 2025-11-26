//! Error types for platform operations

use thiserror::Error;

/// Result type alias for platform operations
pub type Result<T> = std::result::Result<T, PlatformError>;

/// Errors that can occur during platform API operations
#[derive(Error, Debug)]
pub enum PlatformError {
    /// Resource not found (e.g., team, repo, issue)
    #[error("Resource not found: {0}")]
    NotFound(String),

    /// Platform service not found or unreachable
    #[error("Service not found: {0}")]
    ServiceNotFound(String),

    /// Authentication failed (invalid token or credentials)
    #[error("Bad credentials: {0}")]
    BadCredentials(String),

    /// Invalid URL format
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    /// File operation error
    #[error("File error: {0}")]
    FileError(String),

    /// Network/HTTP error
    #[error("Network error: {0}")]
    NetworkError(#[from] reqwest::Error),

    /// Git operation error
    #[error("Git error: {0}")]
    GitError(#[from] git2::Error),

    /// Unexpected platform error
    #[error("Unexpected error: {0}")]
    Unexpected(String),

    /// Generic platform error with context
    #[error("Platform error: {0}")]
    Other(String),
}

impl PlatformError {
    /// Create a NotFound error
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::NotFound(msg.into())
    }

    /// Create a BadCredentials error
    pub fn bad_credentials(msg: impl Into<String>) -> Self {
        Self::BadCredentials(msg.into())
    }

    /// Create an InvalidUrl error
    pub fn invalid_url(msg: impl Into<String>) -> Self {
        Self::InvalidUrl(msg.into())
    }

    /// Create an Unexpected error
    pub fn unexpected(msg: impl Into<String>) -> Self {
        Self::Unexpected(msg.into())
    }
}
