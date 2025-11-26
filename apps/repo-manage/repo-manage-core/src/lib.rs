//! RepoBee Core Library
//!
//! This crate provides the core abstractions and types for RepoBee,
//! including platform API abstraction for GitHub, GitLab, and Gitea.

pub mod error;
pub mod lms;
pub mod platform;
pub mod settings;
pub mod setup;
pub mod types;

// Re-export commonly used items
pub use error::{PlatformError, Result};
pub use platform::{Platform, PlatformAPI};
pub use setup::{setup_student_repos, SetupError, SetupResult};
pub use types::{
    Issue, IssueState, Repo, StudentRepo, StudentTeam, Team, TeamPermission, TemplateRepo,
};

// LMS re-exports
pub use lms::{
    create_lms_client_with_params, generate_repobee_yaml, generate_repobee_yaml_with_progress,
    get_student_info, get_student_info_with_progress, write_csv_file, write_yaml_file,
    FetchProgress, MemberOption as LmsMemberOption, StudentInfo, YamlConfig,
};

// Re-export lms-common types (used throughout the app)
pub use lms_common::{
    get_token_generation_instructions, get_token_generation_url, open_token_generation_url, Course,
    Group, GroupMembership, LmsClient as LmsClientTrait, LmsType as LmsCommonType, User,
};

// Re-export unified LMS client
pub use lms_client::{LmsAuth, LmsClient, LmsType};

// Settings re-exports
pub use settings::{
    atomic_write, atomic_write_json, atomic_write_string, ActiveTab, CLIConfig, CommonSettings,
    ConfigError, ConfigResult, DirectoryLayout, GuiSettings, Interface, LocationManager,
    LmsUrlOption, MemberOption, Normalize, PathValidationMode, SettingsLocation,
    SettingsManager, Validate, ValidationErrors, join_comma_separated, normalize_path,
    normalize_paths, normalize_string, normalize_string_vec, normalize_url,
    parse_comma_separated, path_to_posix_string, validate_date, validate_date_range,
    validate_glob_pattern, validate_path,
};
