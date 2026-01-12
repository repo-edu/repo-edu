//! # Canvas LMS API Client
//!
//! Comprehensive Rust client for the Canvas LMS API, providing access to courses,
//! groups, users, assignments, and more.
//!
//! ## Features
//!
//! - Full async/await support with tokio
//! - Automatic pagination handling
//! - Type-safe request builders
//! - Comprehensive error handling
//! - Support for both token-based and OAuth2 authentication
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use canvas_lms::CanvasClient;
//! use lms_common::LmsClient;
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     // Create a client
//!     let client = CanvasClient::new(
//!         "https://canvas.instructure.com",
//!         "your_access_token",
//!         None,
//!     )?;
//!
//!     // Get all courses
//!     let courses = client.get_courses().await?;
//!
//!     for course in courses {
//!         println!("Course: {} (ID: {})", course.name, course.id);
//!     }
//!
//!     Ok(())
//! }
//! ```
//!
//! ## Authentication
//!
//! Canvas supports two authentication methods:
//!
//! ### 1. Access Token (Recommended for getting started)
//!
//! Generate a token from your Canvas profile settings and use it directly:
//!
//! ```rust,no_run
//! # use canvas_lms::CanvasClient;
//! let client = CanvasClient::new("https://canvas.edu", "your_token", None)?;
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```
//!
//! ### 2. OAuth2 (For production applications)
//!
//! Use OAuth2 for user-authorized access (requires `oauth` feature):
//!
//! ```rust,ignore
//! // This requires the oauth feature and additional setup
//! use canvas_lms::CanvasOAuthClient;
//!
//! let oauth_client = CanvasOAuthClient::new(
//!     "https://canvas.edu",
//!     "client_id",
//!     "client_secret",
//! )?;
//! ```

pub mod client;
pub mod endpoints;
pub mod models;
pub mod pagination;

pub use client::CanvasClient;
pub use lms_common::{LmsClient, LmsError, LmsResult};

// Re-export common types
pub use models::{
    CanvasAssignment, CanvasCourse, CanvasEnrollment, CanvasGroup, CanvasSubmission, CanvasUser,
};
