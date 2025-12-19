//! # LMS Common
//!
//! Common traits, types, and utilities for Learning Management System (LMS) API clients.
//!
//! This crate provides:
//! - Core traits for LMS clients (`LmsClient`, `OAuth`)
//! - Shared data types (`Course`, `Group`, `User`, `Assignment`)
//! - Token storage and management
//! - Common error types
//!
//! ## Example
//!
//! ```rust,no_run
//! use lms_common::{LmsClient, Course};
//! # use lms_common::LmsError;
//! # async fn example() -> Result<(), LmsError> {
//! // Implement LmsClient for your specific LMS
//! # struct MyClient;
//! # #[async_trait::async_trait]
//! # impl LmsClient for MyClient {
//! #     async fn get_courses(&self) -> Result<Vec<Course>, LmsError> { todo!() }
//! #     async fn get_course(&self, course_id: &str) -> Result<Course, LmsError> { todo!() }
//! #     async fn get_groups(&self, course_id: &str) -> Result<Vec<lms_common::Group>, LmsError> { todo!() }
//! #     async fn get_assignments(&self, course_id: &str) -> Result<Vec<lms_common::Assignment>, LmsError> { todo!() }
//! #     async fn get_users(&self, course_id: &str) -> Result<Vec<lms_common::User>, LmsError> { todo!() }
//! #     async fn get_group_members(&self, group_id: &str) -> Result<Vec<lms_common::GroupMembership>, LmsError> { todo!() }
//! # }
//! # let client = MyClient;
//! let courses = client.get_courses().await?;
//! # Ok(())
//! # }
//! ```

pub mod error;
pub mod helpers;
pub mod retry;
pub mod storage;
pub mod traits;
pub mod types;

// Re-export commonly used items
pub use error::{LmsError, LmsResult};
pub use helpers::{
    detect_lms_type, get_token_generation_instructions, get_token_generation_url, get_token_info,
    get_token_info_with_type, open_token_generation_url, Confidence, LmsDetection, LmsType,
    TokenInfo,
};
pub use retry::{with_retry, RetryConfig};
pub use traits::{LmsClient, OAuth, Token};
pub use types::{
    Assignment, Course, Enrollment, Group, GroupMembership, PaginationInfo, Submission, User,
};
