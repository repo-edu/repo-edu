use crate::settings::ConfigError;
use crate::{LmsError, PlatformError};
use thiserror::Error;

/// Error type for operation handlers.
///
/// Note: This is distinct from the generated `OperationError` type, which
/// represents per-repo errors within an `OperationResult`.
#[derive(Debug, Error)]
pub enum HandlerError {
    #[error("Settings error: {0}")]
    Settings(#[from] ConfigError),

    #[error("Platform error: {0}")]
    Platform(#[from] PlatformError),

    #[error("LMS error: {0}")]
    Lms(#[from] LmsError),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("{0}")]
    Other(String),
}

impl HandlerError {
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::NotFound(msg.into())
    }

    pub fn other(msg: impl Into<String>) -> Self {
        Self::Other(msg.into())
    }
}
