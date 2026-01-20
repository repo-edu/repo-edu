//! Shared operation handlers for CLI and GUI.
//!
//! These handlers contain the business logic extracted from Tauri commands.
//! Both CLI and Tauri call these handlers, differing only in how they
//! obtain parameters and report progress.

mod error;
mod lms;
mod platform;
mod repo;
mod validation;

pub use crate::{LmsOperationContext, ProgressEvent, RepoOperationContext};
pub use error::HandlerError;

pub use lms::{
    apply_cached_group_set_to_assignment, cache_group_set, delete_cached_group_set,
    detach_assignment_source, fetch_group_set_list, fetch_groups_for_set, import_groups,
    import_students, list_cached_group_sets, recache_group_set_for_assignment,
    refresh_cached_group_set, verify_connection as verify_lms_connection,
};

pub use platform::verify_connection;

pub use repo::{
    clone_repos, create_repos, delete_repos, preflight_clone, preflight_create, preflight_delete,
    CloneReposParams, CreateReposParams, DeleteReposParams,
};

pub use validation::{validate_assignment, validate_roster};
