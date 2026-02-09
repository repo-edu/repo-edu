//! Canvas LMS client implementation

use crate::models::*;
use crate::pagination::get_next_page_url;
use lms_common::{
    types::{Assignment, Course, Group, GroupCategory, GroupMembership, User},
    with_retry, LmsClient, LmsError, LmsResult, RetryConfig,
};
use reqwest::{header, Client, Response};
use serde::de::DeserializeOwned;
use std::time::Duration;

/// Default User-Agent when none is provided
const DEFAULT_USER_AGENT: &str = "repo-edu";

/// Canvas API client
#[derive(Debug, Clone)]
pub struct CanvasClient {
    base_url: String,
    http_client: Client,
    retry_config: RetryConfig,
}

impl CanvasClient {
    /// Create a new Canvas client
    ///
    /// # Arguments
    ///
    /// * `base_url` - The base URL of the Canvas instance (e.g., `https://canvas.instructure.com`)
    /// * `token` - The access token for authentication
    /// * `user_agent` - Optional User-Agent header identifying the caller (recommended format: "Organization / contact@email.edu")
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use canvas_lms::CanvasClient;
    ///
    /// let client = CanvasClient::new(
    ///     "https://canvas.instructure.com",
    ///     "your_access_token",
    ///     Some("MyUniversity / admin@uni.edu"),
    /// )?;
    /// # Ok::<(), lms_common::LmsError>(())
    /// ```
    pub fn new(
        base_url: impl Into<String>,
        token: impl Into<String>,
        user_agent: Option<&str>,
    ) -> LmsResult<Self> {
        let base_url = base_url.into().trim_end_matches('/').to_string();
        let token = token.into();
        let user_agent = user_agent.unwrap_or(DEFAULT_USER_AGENT);

        // Build HTTP client with default headers
        let mut headers = header::HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            header::HeaderValue::from_str(&format!("Bearer {}", token))
                .map_err(|e| LmsError::auth_error(format!("Invalid token format: {}", e)))?,
        );
        headers.insert(
            header::ACCEPT,
            header::HeaderValue::from_static("application/json"),
        );

        let http_client = Client::builder()
            .default_headers(headers)
            .user_agent(user_agent)
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| LmsError::Other(format!("Failed to build HTTP client: {}", e)))?;

        Ok(Self {
            base_url,
            http_client,
            retry_config: RetryConfig::default(),
        })
    }

    /// Set a custom retry configuration
    pub fn with_retry_config(mut self, config: RetryConfig) -> Self {
        self.retry_config = config;
        self
    }

    /// Get the base API URL
    fn api_url(&self, path: &str) -> String {
        format!("{}/api/v1/{}", self.base_url, path.trim_start_matches('/'))
    }

    /// Make a GET request to the Canvas API with automatic retry on rate limit
    async fn get<T: DeserializeOwned>(&self, path: &str) -> LmsResult<T> {
        let url = self.api_url(path);
        with_retry(&self.retry_config, || {
            let url = url.clone();
            async move {
                let response = self.http_client.get(&url).send().await?;
                self.handle_response(response).await
            }
        })
        .await
    }

    /// Make a GET request with query parameters and return the response
    async fn get_response_with_params(
        &self,
        path: &str,
        params: &[(String, String)],
    ) -> LmsResult<Response> {
        let url = self.api_url(path);
        let params = params.to_vec();
        with_retry(&self.retry_config, || {
            let url = url.clone();
            let params = params.clone();
            async move {
                let response = self.http_client.get(&url).query(&params).send().await?;
                self.check_response_status(&response)?;
                Ok(response)
            }
        })
        .await
    }

    /// Check response status and return an error if not successful
    fn check_response_status(&self, response: &Response) -> LmsResult<()> {
        let status = response.status();
        if !status.is_success() {
            return Err(match status.as_u16() {
                401 => LmsError::auth_error("Authentication failed. Check your access token."),
                403 => LmsError::auth_error("Access forbidden. You may not have permission."),
                404 => LmsError::not_found("Resource not found"),
                429 => {
                    let retry_after = response
                        .headers()
                        .get(header::RETRY_AFTER)
                        .and_then(|v| v.to_str().ok())
                        .and_then(|s| s.parse().ok());
                    LmsError::RateLimitExceeded { retry_after }
                }
                _ => LmsError::api_error(
                    status.as_u16(),
                    format!("API request failed with status {}", status),
                ),
            });
        }
        Ok(())
    }

    /// Handle API response and deserialize JSON
    async fn handle_response<T: DeserializeOwned>(&self, response: Response) -> LmsResult<T> {
        self.check_response_status(&response)?;

        // Get response as text first for better error reporting
        let response_text = response.text().await?;

        let data = Self::decode_response(&response_text)?;
        Ok(data)
    }

    fn decode_response<T: DeserializeOwned>(response_text: &str) -> LmsResult<T> {
        serde_json::from_str::<T>(response_text).map_err(|e| {
            let preview = response_text.chars().take(500).collect::<String>();
            LmsError::Other(format!(
                "Failed to decode Canvas API response: {}\n\nResponse body preview (first 500 chars):\n{}\n\nThis may indicate a data format mismatch or API version incompatibility.",
                e, preview
            ))
        })
    }

    /// Fetch all pages of a paginated resource
    async fn get_all_pages<T: DeserializeOwned>(
        &self,
        path: &str,
        params: Vec<(String, String)>,
    ) -> LmsResult<Vec<T>> {
        let mut all_items = Vec::new();
        let mut current_params = params;

        // Add per_page if not already present
        if !current_params.iter().any(|(k, _)| k == "per_page") {
            current_params.push(("per_page".to_string(), "100".to_string()));
        }

        loop {
            let response = self.get_response_with_params(path, &current_params).await?;
            let headers = response.headers().clone();
            let response_text = response.text().await?;
            let items: Vec<T> = Self::decode_response(&response_text)?;

            all_items.extend(items);

            // Check for next page
            if let Some(next_url) = get_next_page_url(&headers) {
                // Extract query parameters from next URL
                if let Ok(url) = url::Url::parse(&next_url) {
                    current_params = url
                        .query_pairs()
                        .map(|(k, v)| (k.into_owned(), v.into_owned()))
                        .collect();
                    continue;
                }
            }

            break;
        }

        Ok(all_items)
    }

    /// Get all groups for a specific course with automatic pagination
    ///
    /// # Arguments
    ///
    /// * `course_id` - The course ID
    pub async fn get_course_groups(&self, course_id: &str) -> LmsResult<Vec<Group>> {
        let path = format!("courses/{}/groups", course_id);
        let canvas_groups: Vec<CanvasGroup> = self.get_all_pages(&path, Vec::new()).await?;
        Ok(canvas_groups.into_iter().map(|g| g.into()).collect())
    }

    /// Get all groups for a specific course with group category info included
    ///
    /// # Arguments
    ///
    /// * `course_id` - The course ID
    async fn get_course_groups_with_categories(
        &self,
        course_id: &str,
    ) -> LmsResult<Vec<CanvasGroup>> {
        let path = format!("courses/{}/groups", course_id);
        let params = vec![("include[]".to_string(), "group_category".to_string())];
        self.get_all_pages(&path, params).await
    }

    /// Get all groups in a specific group category with automatic pagination
    ///
    /// # Arguments
    ///
    /// * `group_category_id` - The group category (group set) ID
    pub async fn get_group_category_groups(
        &self,
        group_category_id: &str,
    ) -> LmsResult<Vec<Group>> {
        let path = format!("group_categories/{}/groups", group_category_id);
        let canvas_groups: Vec<CanvasGroup> = self.get_all_pages(&path, Vec::new()).await?;
        Ok(canvas_groups.into_iter().map(|g| g.into()).collect())
    }

    /// Get all users enrolled in a course with automatic pagination.
    ///
    /// Includes enrollments in the response for enrollment type classification.
    ///
    /// # Arguments
    ///
    /// * `course_id` - The course ID
    pub async fn get_course_users(&self, course_id: &str) -> LmsResult<Vec<User>> {
        // Request all core enrollment types explicitly to ensure staff
        // (teacher/ta/designer/observer) are always included.
        self.get_course_users_filtered(
            course_id,
            &[
                "StudentEnrollment",
                "TeacherEnrollment",
                "TaEnrollment",
                "DesignerEnrollment",
                "ObserverEnrollment",
            ],
        )
        .await
    }

    /// Get users enrolled in a course, filtered by enrollment types.
    ///
    /// Canvas supports filtering by enrollment type via `enrollment_type[]` parameter.
    /// Values: "StudentEnrollment", "TeacherEnrollment", "TaEnrollment",
    /// "DesignerEnrollment", "ObserverEnrollment".
    ///
    /// # Arguments
    ///
    /// * `course_id` - The course ID
    /// * `enrollment_types` - Enrollment types to include (empty = all types)
    pub async fn get_course_users_filtered(
        &self,
        course_id: &str,
        enrollment_types: &[&str],
    ) -> LmsResult<Vec<User>> {
        let path = format!("courses/{}/users", course_id);
        let mut params = vec![("include[]".to_string(), "enrollments".to_string())];
        for et in enrollment_types {
            params.push(("enrollment_type[]".to_string(), et.to_string()));
        }
        let canvas_users: Vec<CanvasUser> = self.get_all_pages(&path, params).await?;
        Ok(canvas_users.into_iter().map(|u| u.into()).collect())
    }

    /// Get all assignments for a course with automatic pagination
    ///
    /// # Arguments
    ///
    /// * `course_id` - The course ID
    pub async fn get_course_assignments(&self, course_id: &str) -> LmsResult<Vec<Assignment>> {
        let path = format!("courses/{}/assignments", course_id);
        let canvas_assignments: Vec<CanvasAssignment> =
            self.get_all_pages(&path, Vec::new()).await?;
        Ok(canvas_assignments.into_iter().map(|a| a.into()).collect())
    }

    /// Get a specific course by ID
    ///
    /// # Arguments
    ///
    /// * `course_id` - The course ID
    pub async fn get_course_by_id(&self, course_id: &str) -> LmsResult<Course> {
        let path = format!("courses/{}", course_id);
        let canvas_course: CanvasCourse = self.get(&path).await?;
        Ok(canvas_course.into())
    }

    /// Get current user's profile
    pub async fn get_current_user(&self) -> LmsResult<User> {
        let canvas_user: CanvasUser = self.get("users/self").await?;
        Ok(canvas_user.into())
    }

    /// Validate the access token by making a simple API call
    ///
    /// Returns the current user if the token is valid
    pub async fn validate_token(&self) -> LmsResult<User> {
        self.get_current_user().await
    }

    /// Get all members of a group
    ///
    /// # Arguments
    ///
    /// * `group_id` - The group ID
    pub async fn get_group_memberships(&self, group_id: &str) -> LmsResult<Vec<GroupMembership>> {
        let path = format!("groups/{}/memberships", group_id);
        let canvas_memberships: Vec<CanvasGroupMembership> =
            self.get_all_pages(&path, Vec::new()).await?;
        Ok(canvas_memberships.into_iter().map(|m| m.into()).collect())
    }

    /// Get all group categories for a course with automatic pagination
    ///
    /// # Arguments
    ///
    /// * `course_id` - The course ID
    async fn get_course_group_categories(&self, course_id: &str) -> LmsResult<Vec<GroupCategory>> {
        let path = format!("courses/{}/group_categories", course_id);
        let canvas_categories: Vec<CanvasGroupCategory> =
            self.get_all_pages(&path, Vec::new()).await?;
        Ok(canvas_categories.into_iter().map(|c| c.into()).collect())
    }

    /// Get group categories for a course, filtered to only those with groups
    /// Falls back to deriving categories from groups if direct endpoint is forbidden
    ///
    /// # Arguments
    ///
    /// * `course_id` - The course ID
    pub async fn get_course_group_categories_with_groups(
        &self,
        course_id: &str,
    ) -> LmsResult<Vec<GroupCategory>> {
        // Try direct endpoint first
        match self.get_course_group_categories(course_id).await {
            Ok(categories) => {
                // Filter to only categories with groups
                let groups = self.get_course_groups(course_id).await?;
                let category_ids_with_groups: std::collections::HashSet<String> = groups
                    .iter()
                    .filter_map(|g| g.group_category_id.clone())
                    .collect();

                Ok(categories
                    .into_iter()
                    .filter(|c| category_ids_with_groups.contains(&c.id))
                    .collect())
            }
            Err(LmsError::AuthError(_)) => {
                // Fallback: derive categories from groups (with category info included)
                let groups = self.get_course_groups_with_categories(course_id).await?;

                // Build unique categories from groups
                let mut categories_map: std::collections::HashMap<String, GroupCategory> =
                    std::collections::HashMap::new();

                for group in &groups {
                    if let Some(cat_id) = group.group_category_id {
                        let cat_id_str = cat_id.to_string();
                        categories_map.entry(cat_id_str.clone()).or_insert_with(|| {
                            let name = group
                                .group_category
                                .as_ref()
                                .map(|c| c.name.clone())
                                .unwrap_or_else(|| format!("Group Set {}", cat_id));
                            GroupCategory {
                                id: cat_id_str,
                                name,
                                role: None,
                                self_signup: None,
                                course_id: group.course_id.map(|id| id.to_string()),
                                group_limit: None,
                            }
                        });
                    }
                }

                Ok(categories_map.into_values().collect())
            }
            Err(e) => Err(e),
        }
    }
}

#[async_trait::async_trait]
impl LmsClient for CanvasClient {
    async fn get_courses(&self) -> LmsResult<Vec<Course>> {
        let canvas_courses: Vec<CanvasCourse> = self.get_all_pages("courses", Vec::new()).await?;
        Ok(canvas_courses.into_iter().map(|c| c.into()).collect())
    }

    async fn get_course(&self, course_id: &str) -> LmsResult<Course> {
        self.get_course_by_id(course_id).await
    }

    async fn get_groups(&self, course_id: &str) -> LmsResult<Vec<Group>> {
        self.get_course_groups(course_id).await
    }

    async fn get_assignments(&self, course_id: &str) -> LmsResult<Vec<Assignment>> {
        self.get_course_assignments(course_id).await
    }

    async fn get_users(&self, course_id: &str) -> LmsResult<Vec<User>> {
        self.get_course_users(course_id).await
    }

    async fn get_group_members(&self, group_id: &str) -> LmsResult<Vec<GroupMembership>> {
        self.get_group_memberships(group_id).await
    }

    async fn get_group_categories(&self, course_id: &str) -> LmsResult<Vec<GroupCategory>> {
        self.get_course_group_categories_with_groups(course_id)
            .await
    }

    async fn validate_token(&self) -> LmsResult<User> {
        self.get_current_user().await
    }
}
