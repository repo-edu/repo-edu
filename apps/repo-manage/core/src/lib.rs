//! RepoBee Core Library
//!
//! This crate provides the core abstractions and types for RepoBee,
//! including platform API abstraction for GitHub, GitLab, and Gitea.

pub mod context;
pub mod error;
pub mod generated;
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
    clone_repos, create_repos, delete_repos, export_group_set, fetch_group_set_list,
    fetch_groups_for_set, import_group_set, import_roster_from_lms, import_students,
    preflight_clone, preflight_create, preflight_delete, preview_import_group_set,
    preview_reimport_group_set, reimport_group_set, sync_group_set, validate_assignment,
    validate_roster, verify_connection, verify_lms_connection, CloneReposParams, CreateReposParams,
    DeleteReposParams, HandlerError,
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
    AssignmentId, CloneConfig, CommandResult, CreateConfig, DeleteConfig, DirectoryLayout,
    EnrollmentType, GitUsernameImportSummary, GitVerifyResult, GroupFileImportResult,
    GroupFileImportSummary, GroupSelectionMode, GroupSelectionPreview, GroupSet,
    GroupSetConnection, GroupSetImportPreview, GroupSetImportResult, GroupSetSyncResult,
    ImportConflict, ImportGitUsernamesResult, ImportRosterResult, ImportStudentsResult,
    ImportSummary, InvalidUsername, LmsContextKey, LmsGroup, LmsGroupSet, LmsIdConflict,
    LmsOperationContext, LmsVerifyResult, MemberStatus, OperationError, OperationResult,
    PatternFilterResult, RepoCollision, RepoCollisionKind, RepoOperationContext,
    RepoPreflightResult, RosterConnection, RosterMember, RosterMemberId, SkippedGroup,
    SkippedGroupReason, SystemGroupSetEnsureResult, UsernameInvalidReason,
    UsernameVerificationError, UsernameVerificationResult, UsernameVerificationScope,
    ValidationIssue, ValidationKind, ValidationResult, VerifyGitUsernamesResult,
};

// Roster module re-exports
pub use roster::{
    active_member_ids, ensure_system_group_sets, filter_by_pattern, generate_group_name,
    generate_unique_group_name, preview_group_selection, resolve_assignment_groups,
    selection_mode_all, selection_mode_pattern,
    validate_glob_pattern as validate_simple_glob_pattern, SimpleGlob, ORIGIN_LMS, ORIGIN_LOCAL,
    ORIGIN_SYSTEM, SYSTEM_TYPE_INDIVIDUAL_STUDENTS, SYSTEM_TYPE_STAFF,
};

// Test utilities (only available in test builds)
#[cfg(test)]
pub mod test_utils;
