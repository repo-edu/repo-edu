//! Progress reporting abstraction for CLI and GUI

/// Progress events emitted during operations
#[derive(Debug, Clone)]
pub enum ProgressEvent {
    /// Simple status message
    Status(String),
    /// Inline progress (overwrites previous line in CLI)
    Inline(String),
    /// Operation started
    Started { operation: String },
    /// Operation completed successfully
    Completed {
        operation: String,
        details: Option<String>,
    },
    /// Operation failed
    Failed { operation: String, error: String },
    /// Progress with count
    Progress {
        current: usize,
        total: usize,
        message: String,
    },
}

impl ProgressEvent {
    /// Create a status event
    pub fn status(msg: impl Into<String>) -> Self {
        Self::Status(msg.into())
    }

    /// Create a started event
    pub fn started(operation: impl Into<String>) -> Self {
        Self::Started {
            operation: operation.into(),
        }
    }

    /// Create a completed event
    pub fn completed(operation: impl Into<String>, details: Option<String>) -> Self {
        Self::Completed {
            operation: operation.into(),
            details,
        }
    }

    /// Create a failed event
    pub fn failed(operation: impl Into<String>, error: impl Into<String>) -> Self {
        Self::Failed {
            operation: operation.into(),
            error: error.into(),
        }
    }

    /// Create a progress event
    pub fn progress(current: usize, total: usize, message: impl Into<String>) -> Self {
        Self::Progress {
            current,
            total,
            message: message.into(),
        }
    }
}
