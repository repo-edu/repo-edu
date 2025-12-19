//! # Moodle LMS API Client
//!
//! Comprehensive Rust client for the Moodle Web Services API.
//!
//! ## Features
//!
//! - Full async/await support with tokio
//! - Token-based authentication
//! - Type-safe request builders
//! - Comprehensive error handling
//! - Support for core Moodle Web Services functions
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use moodle_lms::MoodleClient;
//! use lms_common::LmsClient;
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     // Create a client
//!     let client = MoodleClient::new(
//!         "https://moodle.example.edu",
//!         "your_webservice_token"
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
//! Moodle uses token-based authentication. To get a token:
//!
//! 1. Enable Web Services in Moodle (Site Administration > Advanced features)
//! 2. Create a web service (Site Administration > Server > Web services)
//! 3. Add required functions to the service
//! 4. Create a token for a user (Site Administration > Plugins > Web services > Manage tokens)
//!
//! Or use the token generation endpoint:
//! ```text
//! https://your-moodle.edu/login/token.php?username=USERNAME&password=PASSWORD&service=SERVICENAME
//! ```

pub mod client;
pub mod models;

pub use client::MoodleClient;
pub use lms_common::{LmsClient, LmsError, LmsResult};

// Re-export common types
pub use models::{
    MoodleAssignment, MoodleCourse, MoodleEnrolledUser, MoodleGroup, MoodleGroupMembership,
    MoodleUser,
};
