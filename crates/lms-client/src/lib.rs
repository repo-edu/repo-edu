//! # LMS - Unified Rust API Client for Learning Management Systems
//!
//! This crate provides a unified interface for interacting with multiple Learning
//! Management Systems (Canvas, Moodle) with runtime selection.
//!
//! ## Features
//!
//! - **Runtime LMS selection** - Choose LMS type at runtime without changing imports
//! - **Type-safe authentication** - Compile-time validation of auth methods
//! - **Unified interface** - Same API regardless of LMS type
//! - **All LMS features** - Full access to platform-specific clients when needed
//!
//! ## Quick Start
//!
//! ### Unified Client (Recommended)
//!
//! ```rust,no_run
//! use lms_client::{LmsClient, LmsAuth, LmsType};
//! use lms_common::LmsClient as _;  // Import trait for methods
//!
//! # async fn example() -> Result<(), lms_common::LmsError> {
//! // Create client with runtime LMS selection
//! let client = LmsClient::new(
//!     LmsType::Canvas,
//!     LmsAuth::Token {
//!         url: "https://canvas.tue.nl".to_string(),
//!         token: "your_token".to_string(),
//!     }
//! )?;
//!
//! // Use the same interface for all LMS types
//! let courses = client.get_courses().await?;
//! for course in courses {
//!     println!("Course: {}", course.name);
//! }
//! # Ok(())
//! # }
//! ```
//!
//! ### Platform-Specific Clients
//!
//! You can still use platform-specific clients directly when needed:
//!
//! ```rust,no_run
//! use lms_client::CanvasClient;
//! use lms_common::LmsClient as _;
//!
//! # async fn example() -> Result<(), lms_common::LmsError> {
//! let client = CanvasClient::new("https://canvas.tue.nl", "token")?;
//! let courses = client.get_courses().await?;
//! # Ok(())
//! # }
//! ```
//!
//! ## Authentication
//!
//! Authentication uses the same token-based approach for Canvas and Moodle:
//!
//! ```rust
//! use lms_client::LmsAuth;
//!
//! let auth = LmsAuth::Token {
//!     url: "https://canvas.tue.nl".to_string(),
//!     token: "your_access_token".to_string(),
//! };
//! ```
//!
//! ## Auto-Detection
//!
//! Use the built-in auto-detection to simplify setup:
//!
//! ```rust
//! use lms_client::{detect_lms_type, get_token_info, LmsDetection};
//!
//! match detect_lms_type("https://canvas.tue.nl") {
//!     LmsDetection::Detected(lms_type) => {
//!         println!("Detected: {:?}", lms_type);
//!     }
//!     LmsDetection::Probable(lms_type) => {
//!         println!("Probably: {:?}", lms_type);
//!     }
//!     LmsDetection::Unknown => {
//!         println!("Could not detect LMS type");
//!     }
//! }
//! ```

// Core authentication and client
pub mod auth;
pub mod client;

// Re-export the unified types
pub use auth::LmsAuth;
pub use client::LmsClient;

// Re-export everything from lms-common for convenience
pub use lms_common::*;

// Re-export platform-specific clients for direct access
pub use canvas_lms::CanvasClient;
pub use moodle_lms::MoodleClient;
