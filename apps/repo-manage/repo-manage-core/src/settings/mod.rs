//! Settings management module for RepoBee
//!
//! This module provides persistent settings storage with:
//! - Platform-specific config directories
//! - JSON serialization with schema validation
//! - Default values
//! - Atomic file operations
//! - Location file tracking
//! - Input normalization and validation
//! - Type-safe enums
//! - CLI and GUI configuration support

mod atomic;
mod cli;
mod common;
mod enums;
mod error;
mod gui;
mod location;
mod manager;
mod normalization;
mod validation;

// Public exports
pub use atomic::{atomic_write, atomic_write_json, atomic_write_string};
pub use cli::CLIConfig;
pub use common::CommonSettings;
pub use enums::{ActiveTab, DirectoryLayout, LmsUrlOption, MemberOption};
pub use error::{ConfigError, ConfigResult, Interface};
pub use gui::GuiSettings;
pub use location::{LocationManager, SettingsLocation};
pub use manager::SettingsManager;
pub use normalization::{
    join_comma_separated, normalize_path, normalize_paths, normalize_string, normalize_string_vec,
    normalize_url, parse_comma_separated, path_to_posix_string, Normalize,
};
pub use validation::{
    validate_date, validate_date_range, validate_glob_pattern, validate_path,
    PathValidationMode, Validate, ValidationErrors,
};
