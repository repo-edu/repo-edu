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
    attach_group_set_to_assignment, break_group_set_link, clear_assignment_group_set,
    copy_group_set, copy_group_set_to_assignment, delete_group_set, fetch_group_set_list,
    fetch_groups_for_set, import_students, link_group_set, list_group_sets,
    refresh_linked_group_set, verify_connection as verify_lms_connection,
};

pub use platform::verify_connection;

pub use repo::{
    clone_repos, create_repos, delete_repos, preflight_clone, preflight_create, preflight_delete,
    CloneReposParams, CreateReposParams, DeleteReposParams,
};

pub use validation::{validate_assignment, validate_roster};
