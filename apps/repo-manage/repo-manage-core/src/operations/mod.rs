//! High-level operations shared between CLI and GUI

mod clone;
mod lms;
mod setup;
mod verify;

pub use clone::{clone_repos, CloneParams};
pub use lms::{
    generate_lms_files, verify_lms_course, GenerateLmsFilesParams, GenerateLmsFilesResult,
    VerifyLmsParams, VerifyLmsResult,
};
pub use setup::{setup_repos, SetupParams};
pub use verify::{verify_platform, VerifyParams};
