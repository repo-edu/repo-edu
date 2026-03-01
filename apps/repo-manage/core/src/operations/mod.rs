//! Shared operation handlers for CLI and GUI.
//!
//! These handlers contain the business logic extracted from Tauri commands.
//! Both CLI and Tauri call these handlers, differing only in how they
//! obtain parameters and report progress.

mod error;
mod group_set;
mod lms;
mod platform;
mod repo;
mod validation;

pub use crate::{LmsOperationContext, ProgressEvent, RepoOperationContext};
pub use error::HandlerError;

pub use lms::{
    fetch_group_set_list, fetch_groups_for_set, import_roster_from_lms,
    import_roster_from_lms_with_progress, import_students, sync_group_set,
    sync_group_set_with_progress, verify_connection as verify_lms_connection,
};

pub use platform::verify_connection;

pub use repo::{
    clone_repos, create_repos, delete_repos, preflight_clone, preflight_create, preflight_delete,
    CloneReposParams, CreateReposParams, DeleteReposParams,
};

pub use validation::{validate_assignment, validate_roster};

pub use group_set::{
    export_group_set, import_group_set, preview_import_group_set, preview_reimport_group_set,
    reimport_group_set,
};
