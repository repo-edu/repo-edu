//! Core traits for LMS clients

use crate::error::LmsResult;
use crate::types::{Assignment, Course, Group, GroupCategory, GroupMembership, User};
use async_trait::async_trait;

/// Core trait for LMS API clients
///
/// This trait defines the common interface that all LMS clients must implement.
/// It provides basic operations for retrieving courses, groups, users, and assignments.
#[async_trait]
pub trait LmsClient: Send + Sync {
    /// Get all courses accessible to the authenticated user
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// # use lms_common::{LmsClient, LmsError};
    /// # async fn example(client: impl LmsClient) -> Result<(), LmsError> {
    /// let courses = client.get_courses().await?;
    /// for course in courses {
    ///     println!("Course: {} ({})", course.name, course.id);
    /// }
    /// # Ok(())
    /// # }
    /// ```
    async fn get_courses(&self) -> LmsResult<Vec<Course>>;

    /// Get a specific course by ID
    ///
    /// # Arguments
    ///
    /// * `course_id` - The unique identifier for the course
    async fn get_course(&self, course_id: &str) -> LmsResult<Course>;

    /// Get all groups for a specific course
    ///
    /// # Arguments
    ///
    /// * `course_id` - The unique identifier for the course
    async fn get_groups(&self, course_id: &str) -> LmsResult<Vec<Group>>;

    /// Get all assignments for a specific course
    ///
    /// # Arguments
    ///
    /// * `course_id` - The unique identifier for the course
    async fn get_assignments(&self, course_id: &str) -> LmsResult<Vec<Assignment>>;

    /// Get all users enrolled in a specific course
    ///
    /// # Arguments
    ///
    /// * `course_id` - The unique identifier for the course
    async fn get_users(&self, course_id: &str) -> LmsResult<Vec<User>>;

    /// Get all members of a specific group
    ///
    /// # Arguments
    ///
    /// * `group_id` - The unique identifier for the group
    async fn get_group_members(&self, group_id: &str) -> LmsResult<Vec<GroupMembership>>;

    /// Get group categories (group sets) for a course
    ///
    /// # Arguments
    ///
    /// * `course_id` - The unique identifier for the course
    async fn get_group_categories(&self, course_id: &str) -> LmsResult<Vec<GroupCategory>>;

    /// Validate the access token by fetching current user info
    ///
    /// This is a lightweight way to verify credentials are valid without
    /// fetching all courses.
    async fn validate_token(&self) -> LmsResult<User>;
}

/// Token structure for OAuth authentication
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Token {
    /// Access token
    pub access_token: String,

    /// Token type (usually "Bearer")
    pub token_type: String,

    /// Token expiration time in seconds
    pub expires_in: Option<u64>,

    /// Refresh token (if available)
    pub refresh_token: Option<String>,

    /// Scopes granted to this token
    pub scope: Option<String>,
}

/// OAuth authentication trait
///
/// This trait provides OAuth2 authentication flow support for LMS clients
/// that support it (optional feature).
#[async_trait]
pub trait OAuth: Send + Sync {
    /// Exchange an authorization code for an access token
    ///
    /// # Arguments
    ///
    /// * `code` - The authorization code received from the OAuth flow
    async fn authorize(&self, code: &str) -> LmsResult<Token>;

    /// Refresh an expired access token using a refresh token
    ///
    /// # Arguments
    ///
    /// * `refresh_token` - The refresh token
    async fn refresh_token(&self, refresh_token: &str) -> LmsResult<Token>;

    /// Get the OAuth authorization URL
    ///
    /// # Arguments
    ///
    /// * `redirect_uri` - The URI to redirect to after authorization
    /// * `state` - Optional state parameter for CSRF protection
    fn get_authorization_url(&self, redirect_uri: &str, state: Option<&str>) -> String;
}
