//! RepoBee Core Library
//!
//! This crate provides the core abstractions and types for RepoBee,
//! including platform API abstraction for GitHub, GitLab, and Gitea.

pub mod context;
pub mod error;
mod generated;
pub mod import;
pub mod lms;
pub mod operations;
pub mod platform;
pub mod progress;
pub mod roster;
pub mod settings;
pub mod types;

// Re-export commonly used items
pub use error::{PlatformError, Result};
pub use operations::{
    apply_cached_group_set_to_assignment, cache_group_set, clone_repos, create_repos,
    delete_cached_group_set, delete_repos, detach_assignment_source, fetch_group_set_list,
    fetch_groups_for_set, import_groups, import_students, list_cached_group_sets, preflight_clone,
    preflight_create, preflight_delete, recache_group_set_for_assignment, refresh_cached_group_set,
    validate_assignment, validate_roster, verify_connection, verify_lms_connection,
    CloneReposParams, CreateReposParams, DeleteReposParams, HandlerError,
};
pub use platform::{create_platform, Platform, PlatformAPI, PlatformParams, PlatformType};
pub use progress::ProgressEvent;
pub use types::{
    Issue, IssueState, Repo, RepoCreateResult, StudentRepo, StudentTeam, Team, TeamPermission,
    TemplateRepo,
};

// LMS re-exports
pub use lms::{
    create_lms_client_with_params, generate_lms_files, generate_repobee_yaml,
    generate_repobee_yaml_with_progress, get_student_info,
    get_student_info_and_groups_with_progress, get_student_info_with_progress, verify_lms_course,
    write_csv_file, write_yaml_file, FetchProgress, GenerateLmsFilesParams, GenerateLmsFilesResult,
    MemberOption as LmsMemberOption, StudentInfo, StudentInfoResult, VerifyLmsParams,
    VerifyLmsResult, YamlConfig,
};

// Re-export lms-common types (used throughout the app)
pub use lms_common::{
    error::LmsError, get_token_generation_instructions, get_token_generation_url,
    open_token_generation_url, Course, Group, GroupCategory, GroupMembership,
    LmsClient as LmsClientTrait, LmsType as LmsCommonType, User,
};

// Re-export unified LMS client
pub use lms_client::{LmsAuth, LmsClient, LmsType};

// Settings re-exports
pub use settings::{
    atomic_write, atomic_write_json, atomic_write_string, join_comma_separated, normalize_path,
    normalize_paths, normalize_string, normalize_string_vec, normalize_url, parse_comma_separated,
    path_to_posix_string, validate_date, validate_date_range, validate_glob_pattern, validate_path,
    AppSettings, CLIConfig, ConfigError, ConfigResult, CourseInfo, ExportSettings, GitConnection,
    GitIdentityMode, GitServerType, Interface, LmsConnection, MemberOption, Normalize,
    OperationConfigs, PathValidationMode, PlatformConnection, ProfileSettings, SettingsLoadResult,
    SettingsManager, Theme, Validate, ValidationErrors,
};

// Generated types used by Tauri commands
pub use generated::types::{
    AssignmentId, CachedLmsGroup, CloneConfig, CommandResult, CoverageExportFormat, CoverageReport,
    CreateConfig, DeleteConfig, DirectoryLayout, GitUsernameImportSummary, GitVerifyResult,
    GroupFileImportResult, GroupFileImportSummary, GroupFilter, GroupId, GroupImportConfig,
    GroupImportSummary, ImportGitUsernamesResult, ImportGroupsResult, ImportStudentsResult,
    ImportSummary, InvalidUsername, LmsContextKey, LmsGroup, LmsGroupSet, LmsGroupSetCacheEntry,
    LmsIdConflict, LmsOperationContext, LmsVerifyResult, OperationError, OperationResult,
    RepoCollision, RepoCollisionKind, RepoOperationContext, RepoPreflightResult, SkippedGroup,
    SkippedGroupReason, StudentId, UsernameInvalidReason, UsernameVerificationError,
    UsernameVerificationResult, UsernameVerificationScope, ValidationIssue, ValidationKind,
    ValidationResult, VerifyGitUsernamesResult,
};

// Test utilities (only available in test builds)
#[cfg(test)]
pub mod test_utils;
