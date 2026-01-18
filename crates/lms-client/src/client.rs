//! Unified LMS client with runtime selection

use crate::auth::LmsAuth;
use canvas_lms::CanvasClient;
use lms_common::{types::*, LmsError, LmsResult, LmsType};
use moodle_lms::MoodleClient;

/// Unified LMS client that supports Canvas and Moodle
///
/// This client allows runtime selection of LMS type, eliminating the need
/// to change imports or write match statements for different LMS platforms.
///
/// # Example
///
/// ```rust,no_run
/// use lms_client::{LmsClient, LmsAuth, LmsType};
/// use lms_common::LmsClient as _;  // Import trait for methods
///
/// # async fn example() -> Result<(), lms_common::LmsError> {
/// // Create a Canvas client
/// let client = LmsClient::new(
///     LmsType::Canvas,
///     LmsAuth::Token {
///         url: "https://canvas.tue.nl".to_string(),
///         token: "your_token".to_string(),
///         user_agent: Some("MyOrg / admin@example.edu".to_string()),
///     }
/// )?;
///
/// // Use the same interface regardless of LMS type
/// let courses = client.get_courses().await?;
/// # Ok(())
/// # }
/// ```
#[derive(Debug, Clone)]
pub struct LmsClient {
    kind: ClientKind,
}

/// Private enum holding the actual client implementation
#[derive(Debug, Clone)]
enum ClientKind {
    Canvas(CanvasClient),
    Moodle(MoodleClient),
}

impl LmsClient {
    /// Create a new LMS client with runtime type selection
    ///
    /// # Arguments
    ///
    /// * `lms_type` - The type of LMS (Canvas or Moodle)
    /// * `auth` - Authentication credentials appropriate for the LMS type
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The authentication type doesn't match the LMS type
    ///   (e.g., using OAuth2 auth with Canvas, which requires token auth)
    /// - The underlying client creation fails
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use lms_client::{LmsClient, LmsAuth, LmsType};
    ///
    /// # fn example() -> Result<(), lms_common::LmsError> {
    /// // Canvas with token authentication
    /// let canvas_client = LmsClient::new(
    ///     LmsType::Canvas,
    ///     LmsAuth::Token {
    ///         url: "https://canvas.tue.nl".to_string(),
    ///         token: "token".to_string(),
    ///         user_agent: None,
    ///     }
    /// )?;
    ///
    /// // Moodle with token authentication
    /// let moodle_client = LmsClient::new(
    ///     LmsType::Moodle,
    ///     LmsAuth::Token {
    ///         url: "https://moodle.edu".to_string(),
    ///         token: "token".to_string(),
    ///         user_agent: Some("MyUniversity / dept@uni.edu".to_string()),
    ///     }
    /// )?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn new(lms_type: LmsType, auth: LmsAuth) -> LmsResult<Self> {
        let (url, token, user_agent) = match auth {
            LmsAuth::Token {
                url,
                token,
                user_agent,
            } => (url, token, user_agent),
        };

        let kind = match lms_type {
            LmsType::Canvas => {
                ClientKind::Canvas(CanvasClient::new(url, token, user_agent.as_deref())?)
            }
            LmsType::Moodle => {
                ClientKind::Moodle(MoodleClient::new(url, token, user_agent.as_deref())?)
            }
        };

        Ok(Self { kind })
    }

    /// Get the LMS type of this client
    pub fn lms_type(&self) -> LmsType {
        match &self.kind {
            ClientKind::Canvas(_) => LmsType::Canvas,
            ClientKind::Moodle(_) => LmsType::Moodle,
        }
    }

    /// Get groups for a course, optionally scoped to a group category if supported
    pub async fn get_groups_for_category(
        &self,
        course_id: &str,
        group_category_id: Option<&str>,
    ) -> LmsResult<Vec<Group>> {
        match &self.kind {
            ClientKind::Canvas(client) => match group_category_id {
                Some(category_id) => {
                    // Try direct endpoint first, fall back to filtering from all groups
                    match client.get_group_category_groups(category_id).await {
                        Ok(groups) => Ok(groups),
                        Err(LmsError::AuthError(_)) => {
                            // Fallback: filter from course groups
                            let all_groups = client.get_course_groups(course_id).await?;
                            Ok(all_groups
                                .into_iter()
                                .filter(|g| g.group_category_id.as_deref() == Some(category_id))
                                .collect())
                        }
                        Err(e) => Err(e),
                    }
                }
                None => client.get_course_groups(course_id).await,
            },
            ClientKind::Moodle(client) => {
                let groups = client.get_course_groups(course_id).await?;
                if let Some(category_id) = group_category_id {
                    Ok(groups
                        .into_iter()
                        .filter(|group| group.group_category_id.as_deref() == Some(category_id))
                        .collect())
                } else {
                    Ok(groups)
                }
            }
        }
    }
}

// Implement the LmsClient trait for the unified client
#[async_trait::async_trait]
impl lms_common::LmsClient for LmsClient {
    async fn get_courses(&self) -> LmsResult<Vec<Course>> {
        match &self.kind {
            ClientKind::Canvas(client) => client.get_courses().await,
            ClientKind::Moodle(client) => client.get_courses().await,
        }
    }

    async fn get_course(&self, course_id: &str) -> LmsResult<Course> {
        match &self.kind {
            ClientKind::Canvas(client) => client.get_course(course_id).await,
            ClientKind::Moodle(client) => client.get_course(course_id).await,
        }
    }

    async fn get_groups(&self, course_id: &str) -> LmsResult<Vec<Group>> {
        match &self.kind {
            ClientKind::Canvas(client) => client.get_groups(course_id).await,
            ClientKind::Moodle(client) => client.get_groups(course_id).await,
        }
    }

    async fn get_assignments(&self, course_id: &str) -> LmsResult<Vec<Assignment>> {
        match &self.kind {
            ClientKind::Canvas(client) => client.get_assignments(course_id).await,
            ClientKind::Moodle(client) => client.get_assignments(course_id).await,
        }
    }

    async fn get_users(&self, course_id: &str) -> LmsResult<Vec<User>> {
        match &self.kind {
            ClientKind::Canvas(client) => client.get_users(course_id).await,
            ClientKind::Moodle(client) => client.get_users(course_id).await,
        }
    }

    async fn get_group_members(&self, group_id: &str) -> LmsResult<Vec<GroupMembership>> {
        match &self.kind {
            ClientKind::Canvas(client) => client.get_group_members(group_id).await,
            ClientKind::Moodle(client) => client.get_group_members(group_id).await,
        }
    }

    async fn get_group_categories(&self, course_id: &str) -> LmsResult<Vec<GroupCategory>> {
        match &self.kind {
            ClientKind::Canvas(client) => client.get_group_categories(course_id).await,
            ClientKind::Moodle(client) => client.get_group_categories(course_id).await,
        }
    }

    async fn validate_token(&self) -> LmsResult<User> {
        match &self.kind {
            ClientKind::Canvas(client) => client.validate_token().await,
            ClientKind::Moodle(client) => client.validate_token().await,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canvas_with_token_auth() {
        let result = LmsClient::new(
            LmsType::Canvas,
            LmsAuth::Token {
                url: "https://canvas.tue.nl".to_string(),
                token: "test_token".to_string(),
                user_agent: None,
            },
        );

        assert!(result.is_ok());
        let client = result.unwrap();
        assert_eq!(client.lms_type(), LmsType::Canvas);
    }

    #[test]
    fn test_moodle_with_token_auth() {
        let result = LmsClient::new(
            LmsType::Moodle,
            LmsAuth::Token {
                url: "https://moodle.edu".to_string(),
                token: "test_token".to_string(),
                user_agent: None,
            },
        );

        assert!(result.is_ok());
        let client = result.unwrap();
        assert_eq!(client.lms_type(), LmsType::Moodle);
    }

    #[test]
    fn test_canvas_with_user_agent() {
        let result = LmsClient::new(
            LmsType::Canvas,
            LmsAuth::Token {
                url: "https://canvas.tue.nl".to_string(),
                token: "test_token".to_string(),
                user_agent: Some("TestOrg / test@example.com".to_string()),
            },
        );

        assert!(result.is_ok());
    }
}
