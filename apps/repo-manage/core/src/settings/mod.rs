//! Settings management module for RepoBee
//!
//! This module provides persistent settings storage with:
//! - Platform-specific config directories
//! - JSON serialization with schema validation
//! - Default values
//! - Atomic file operations
//! - Profile management
//! - Input normalization and validation
//! - Type-safe enums
//! - CLI and GUI configuration support

mod atomic;
mod cli;
mod common;
mod enums;
mod error;
mod manager;
mod merge;
mod normalization;
mod validation;

// Public exports
pub use crate::generated::types::{
    AppSettings, CloneConfig, CourseInfo, CreateConfig, DateFormat, DeleteConfig, DirectoryLayout,
    ExportSettings, GitConnection, GitIdentityMode, GitServerType, LmsConnection, LmsType,
    MemberOption, OperationConfigs, PlatformConnection, ProfileSettings, SettingsLoadResult, Theme,
    TimeFormat,
};
pub use atomic::{atomic_write, atomic_write_json, atomic_write_string};
pub use cli::CLIConfig;
pub use error::{ConfigError, ConfigResult, Interface};
pub use manager::SettingsManager;
pub use merge::{merge_with_defaults, merge_with_defaults_warned, MergeResult};
pub use normalization::{
    join_comma_separated, normalize_path, normalize_paths, normalize_string, normalize_string_vec,
    normalize_url, parse_comma_separated, path_to_posix_string, Normalize,
};
pub use validation::{
    validate_date, validate_date_range, validate_glob_pattern, validate_path, PathValidationMode,
    Validate, ValidationErrors,
};
