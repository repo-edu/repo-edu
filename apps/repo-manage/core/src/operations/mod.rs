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
    fetch_group_set_list, fetch_groups_for_set, import_groups, import_students,
    verify_connection as verify_lms_connection,
};

pub use platform::verify_connection;

pub use repo::{
    clone_repos, create_repos, delete_repos, preflight_clone, preflight_create, preflight_delete,
    CloneReposParams, CreateReposParams, DeleteReposParams,
};

pub use validation::{validate_assignment, validate_roster};
