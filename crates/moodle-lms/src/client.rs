//! Moodle Web Services client implementation

use crate::models::*;
use lms_common::{
    types::{Assignment, Course, Group, GroupCategory, GroupMembership, User},
    with_retry, LmsClient, LmsError, LmsResult, RetryConfig,
};
use reqwest::{Client, Response};
use serde::{de::DeserializeOwned, Deserialize};
use serde_json::Value;
use std::time::Duration;

/// Default User-Agent when none is provided
const DEFAULT_USER_AGENT: &str = "repo-edu";

/// Moodle Web Services client
#[derive(Debug, Clone)]
pub struct MoodleClient {
    base_url: String,
    token: String,
    http_client: Client,
    retry_config: RetryConfig,
}

impl MoodleClient {
    /// Create a new Moodle client
    ///
    /// # Arguments
    ///
    /// * `base_url` - The base URL of the Moodle instance (e.g., `https://moodle.example.edu`)
    /// * `token` - The web services token
    /// * `user_agent` - Optional User-Agent header identifying the caller (recommended format: "Organization / contact@email.edu")
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use moodle_lms::MoodleClient;
    ///
    /// let client = MoodleClient::new(
    ///     "https://moodle.example.edu",
    ///     "your_webservice_token",
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

        let http_client = Client::builder()
            .user_agent(user_agent)
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| LmsError::Other(format!("Failed to build HTTP client: {}", e)))?;

        Ok(Self {
            base_url,
            token,
            http_client,
            retry_config: RetryConfig::default(),
        })
    }

    /// Set a custom retry configuration
    pub fn with_retry_config(mut self, config: RetryConfig) -> Self {
        self.retry_config = config;
        self
    }

    /// Get the web service endpoint URL
    fn ws_url(&self) -> String {
        format!("{}/webservice/rest/server.php", self.base_url)
    }

    /// Call a Moodle web service function with automatic retry on rate limit
    async fn call_function<T: DeserializeOwned>(
        &self,
        function_name: &str,
        params: &[(&str, &str)],
    ) -> LmsResult<T> {
        let url = self.ws_url();
        let base_params: Vec<(String, String)> = vec![
            ("wstoken".to_string(), self.token.clone()),
            ("wsfunction".to_string(), function_name.to_string()),
            ("moodlewsrestformat".to_string(), "json".to_string()),
        ];
        let extra_params: Vec<(String, String)> = params
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();

        with_retry(&self.retry_config, || {
            let url = url.clone();
            let mut query_params = base_params.clone();
            query_params.extend(extra_params.clone());
            async move {
                let response = self
                    .http_client
                    .get(&url)
                    .query(&query_params)
                    .send()
                    .await?;

                self.handle_response(response).await
            }
        })
        .await
    }

    /// Handle Moodle API response
    async fn handle_response<T: DeserializeOwned>(&self, response: Response) -> LmsResult<T> {
        let status = response.status();

        if status.as_u16() == 429 {
            return Err(LmsError::RateLimitExceeded { retry_after: None });
        }

        if !status.is_success() {
            return Err(LmsError::api_error(
                status.as_u16(),
                format!("Moodle API request failed with status {}", status),
            ));
        }

        let text = response.text().await?;
        let value: Value = serde_json::from_str(&text).map_err(|e| {
            let preview = text.chars().take(500).collect::<String>();
            LmsError::Other(format!(
                "Failed to parse Moodle response: {}. Response: {}",
                e, preview
            ))
        })?;

        if let Some(_error) = value.get("exception") {
            let error_msg = value
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown Moodle error");
            return Err(LmsError::api_error(
                500,
                format!("Moodle error: {}", error_msg),
            ));
        }

        serde_json::from_value(value).map_err(|e| {
            let preview = text.chars().take(500).collect::<String>();
            LmsError::Other(format!(
                "Failed to decode Moodle payload: {}. Response: {}",
                e, preview
            ))
        })
    }

    /// Get all courses the user has access to
    pub async fn get_all_courses(&self) -> LmsResult<Vec<Course>> {
        let site_info = self.get_site_info().await?;
        self.get_courses_for_user(site_info.userid).await
    }

    async fn get_courses_for_user(&self, user_id: u64) -> LmsResult<Vec<Course>> {
        let user_id_string = user_id.to_string();
        let params = [("userid", user_id_string.as_str())];

        let moodle_courses: Vec<MoodleCourse> = self
            .call_function("core_enrol_get_users_courses", &params)
            .await?;
        Ok(moodle_courses.into_iter().map(|c| c.into()).collect())
    }

    /// Get a specific course by ID
    pub async fn get_course_by_id(&self, course_id: &str) -> LmsResult<Course> {
        #[derive(Deserialize)]
        struct CoursesResponse {
            courses: Vec<MoodleCourse>,
        }

        let response: CoursesResponse = self
            .call_function("core_course_get_courses", &[("options[ids][0]", course_id)])
            .await?;

        response
            .courses
            .into_iter()
            .next()
            .map(|c| c.into())
            .ok_or_else(|| LmsError::not_found(format!("Course {} not found", course_id)))
    }

    /// Get groups for a specific course
    pub async fn get_course_groups(&self, course_id: &str) -> LmsResult<Vec<Group>> {
        self.get_course_groups_with_progress(course_id, &mut |_, _| {})
            .await
    }

    pub async fn get_course_groups_with_progress<F>(
        &self,
        course_id: &str,
        progress_callback: &mut F,
    ) -> LmsResult<Vec<Group>>
    where
        F: FnMut(usize, usize),
    {
        let moodle_groups: Vec<MoodleGroup> = self
            .call_function("core_group_get_course_groups", &[("courseid", course_id)])
            .await?;
        progress_callback(1, moodle_groups.len());
        Ok(moodle_groups.into_iter().map(|g| g.into()).collect())
    }

    /// Get enrolled users for a specific course
    pub async fn get_enrolled_users(&self, course_id: &str) -> LmsResult<Vec<User>> {
        self.get_enrolled_users_with_progress(course_id, &mut |_, _| {})
            .await
    }

    pub async fn get_enrolled_users_with_progress<F>(
        &self,
        course_id: &str,
        progress_callback: &mut F,
    ) -> LmsResult<Vec<User>>
    where
        F: FnMut(usize, usize),
    {
        let moodle_users: Vec<MoodleEnrolledUser> = self
            .call_function("core_enrol_get_enrolled_users", &[("courseid", course_id)])
            .await?;
        progress_callback(1, moodle_users.len());
        Ok(moodle_users.into_iter().map(|u| u.into()).collect())
    }

    /// Get assignments for a specific course
    pub async fn get_course_assignments(&self, course_id: &str) -> LmsResult<Vec<Assignment>> {
        #[derive(Deserialize)]
        struct AssignmentsResponse {
            courses: Vec<CourseAssignments>,
        }

        #[derive(Deserialize)]
        struct CourseAssignments {
            #[allow(dead_code)]
            id: u64,
            assignments: Vec<MoodleAssignment>,
        }

        let response: AssignmentsResponse = self
            .call_function("mod_assign_get_assignments", &[("courseids[0]", course_id)])
            .await?;

        Ok(response
            .courses
            .into_iter()
            .flat_map(|c| c.assignments)
            .map(|a| a.into())
            .collect())
    }

    /// Get current user information
    pub async fn get_current_user(&self) -> LmsResult<User> {
        let site_info = self.get_site_info().await?;
        Ok(site_info.into())
    }

    /// Validate the web service token
    pub async fn validate_token(&self) -> LmsResult<User> {
        self.get_current_user().await
    }

    /// Fetch Moodle site info once for helpers needing the user id
    async fn get_site_info(&self) -> LmsResult<MoodleSiteInfo> {
        self.call_function("core_webservice_get_site_info", &[])
            .await
    }

    /// Get group members
    ///
    /// # Arguments
    ///
    /// * `group_id` - The group ID
    pub async fn get_group_users(&self, group_id: &str) -> LmsResult<Vec<GroupMembership>> {
        self.get_group_users_with_progress(group_id, &mut |_, _| {})
            .await
    }

    pub async fn get_group_users_with_progress<F>(
        &self,
        group_id: &str,
        progress_callback: &mut F,
    ) -> LmsResult<Vec<GroupMembership>>
    where
        F: FnMut(usize, usize),
    {
        let params = vec![("groupids[0]", group_id)];

        #[derive(Deserialize)]
        struct GroupMembersResponse {
            userids: Vec<u64>,
        }

        let response: Vec<GroupMembersResponse> = self
            .call_function("core_group_get_group_members", &params)
            .await?;

        // Moodle returns user IDs only, so we synthesize membership IDs for stability
        let mut memberships = Vec::new();
        if let Some(group_data) = response.first() {
            progress_callback(1, group_data.userids.len());
            for (idx, user_id) in group_data.userids.iter().enumerate() {
                memberships.push(MoodleGroupMembership {
                    id: idx as u64,
                    groupid: group_id
                        .parse()
                        .map_err(|_| LmsError::Other("Invalid group ID".to_string()))?,
                    userid: *user_id,
                });
            }
        }

        Ok(memberships.into_iter().map(|m| m.into()).collect())
    }
}

#[async_trait::async_trait]
impl LmsClient for MoodleClient {
    async fn get_courses(&self) -> LmsResult<Vec<Course>> {
        self.get_all_courses().await
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
        self.get_enrolled_users(course_id).await
    }

    async fn get_group_members(&self, group_id: &str) -> LmsResult<Vec<GroupMembership>> {
        self.get_group_users(group_id).await
    }

    async fn get_group_categories(&self, _course_id: &str) -> LmsResult<Vec<GroupCategory>> {
        // TODO: Implement Moodle group categories
        Ok(Vec::new())
    }

    async fn validate_token(&self) -> LmsResult<User> {
        self.get_current_user().await
    }
}
