//! Error types for LMS operations

use thiserror::Error;

/// Result type for LMS operations
pub type LmsResult<T> = Result<T, LmsError>;

/// Comprehensive error type for LMS operations
#[derive(Error, Debug)]
pub enum LmsError {
    /// HTTP request failed
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    /// API returned an error response
    #[error("API error (status {status}): {message}")]
    ApiError { status: u16, message: String },

    /// Authentication failed
    #[error("Authentication failed: {0}")]
    AuthError(String),

    /// Resource not found
    #[error("Resource not found: {0}")]
    NotFound(String),

    /// Invalid request parameters
    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    /// Rate limit exceeded
    #[error("Rate limit exceeded. Retry after: {retry_after:?}")]
    RateLimitExceeded { retry_after: Option<u64> },

    /// Serialization/deserialization error
    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    /// Token storage error
    #[error("Token storage error: {0}")]
    TokenStorageError(String),

    /// Invalid URL
    #[error("Invalid URL: {0}")]
    InvalidUrl(#[from] url::ParseError),

    /// IO error
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    /// Generic error
    #[error("LMS error: {0}")]
    Other(String),
}

impl LmsError {
    /// Create a new API error
    pub fn api_error(status: u16, message: impl Into<String>) -> Self {
        Self::ApiError {
            status,
            message: message.into(),
        }
    }

    /// Create a new authentication error
    pub fn auth_error(message: impl Into<String>) -> Self {
        Self::AuthError(message.into())
    }

    /// Create a new not found error
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound(message.into())
    }

    /// Create a new invalid request error
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::InvalidRequest(message.into())
    }

    /// Create a new token storage error
    pub fn token_storage_error(message: impl Into<String>) -> Self {
        Self::TokenStorageError(message.into())
    }
}
