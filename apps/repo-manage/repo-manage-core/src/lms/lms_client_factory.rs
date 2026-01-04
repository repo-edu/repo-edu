//! Factory for creating unified LMS clients from settings
use crate::error::{PlatformError, Result};
use crate::lms::types::{Group, StudentInfo};
use crate::settings::LmsConnection;
use lms_client::{LmsAuth, LmsClient, LmsType};
use lms_common::LmsClient as _; // Import trait to call its methods
use std::collections::HashMap;

/// Create an LMS client based on settings
pub fn create_lms_client(settings: &LmsConnection) -> Result<LmsClient> {
    let auth = LmsAuth::Token {
        url: settings.base_url.clone(),
        token: settings.access_token.clone(),
    };

    LmsClient::new(settings.lms_type, auth).map_err(|e| PlatformError::Other(e.to_string()))
}

/// Create an LMS client with explicit parameters (for Tauri commands)
pub fn create_lms_client_with_params(
    lms_type: &str,
    base_url: String,
    access_token: String,
) -> Result<LmsClient> {
    let lms_type = match lms_type {
        "Canvas" => LmsType::Canvas,
        "Moodle" => LmsType::Moodle,
        _ => {
            return Err(PlatformError::Other(format!(
                "Unknown LMS type: {}. Supported: Canvas, Moodle",
                lms_type
            )))
        }
    };

    let auth = LmsAuth::Token {
        url: base_url,
        token: access_token,
    };

    LmsClient::new(lms_type, auth).map_err(|e| PlatformError::Other(e.to_string()))
}

#[derive(Debug, Clone)]
pub enum FetchProgress {
    FetchingUsers,
    FetchingGroups,
    FetchedUsers {
        count: usize,
    },
    FetchedGroups {
        count: usize,
    },
    FetchingGroupMembers {
        current: usize,
        total: usize,
        group_name: String,
    },
}

#[derive(Debug, Clone)]
pub struct StudentInfoResult {
    pub students: Vec<StudentInfo>,
    pub groups: Vec<Group>,
}

/// Fetch all student information for a course using the unified LMS client
pub async fn get_student_info(client: &LmsClient, course_id: &str) -> Result<Vec<StudentInfo>> {
    get_student_info_with_progress(client, course_id, |_| {}).await
}

/// Same as [`get_student_info`] but reports progress via callback
pub async fn get_student_info_with_progress<F>(
    client: &LmsClient,
    course_id: &str,
    progress_callback: F,
) -> Result<Vec<StudentInfo>>
where
    F: FnMut(FetchProgress),
{
    let result =
        get_student_info_and_groups_with_progress(client, course_id, progress_callback).await?;
    Ok(result.students)
}

/// Same as [`get_student_info_with_progress`] but also returns LMS groups
pub async fn get_student_info_and_groups_with_progress<F>(
    client: &LmsClient,
    course_id: &str,
    mut progress_callback: F,
) -> Result<StudentInfoResult>
where
    F: FnMut(FetchProgress),
{
    progress_callback(FetchProgress::FetchingUsers);
    progress_callback(FetchProgress::FetchingGroups);

    // Fetch users and groups in parallel
    let (users, groups) =
        tokio::try_join!(client.get_users(course_id), client.get_groups(course_id))
            .map_err(|e| PlatformError::Other(format!("Failed to fetch course data: {}", e)))?;

    progress_callback(FetchProgress::FetchedUsers { count: users.len() });
    progress_callback(FetchProgress::FetchedGroups {
        count: groups.len(),
    });

    // Build a map of user_id -> group, reporting progress per group
    let mut user_to_group = HashMap::new();
    let total_groups = groups.len();
    for (idx, group) in groups.iter().enumerate() {
        progress_callback(FetchProgress::FetchingGroupMembers {
            current: idx + 1,
            total: total_groups.max(1),
            group_name: group.name.clone(),
        });

        let memberships = client.get_group_members(&group.id).await.map_err(|e| {
            PlatformError::Other(format!("Failed to fetch group memberships: {}", e))
        })?;

        for membership in memberships {
            user_to_group.insert(membership.user_id.clone(), group.clone());
        }
    }

    // Build student info from users
    let mut student_infos = Vec::new();
    for user in users {
        let email = user.email.clone().unwrap_or_default();
        let git_id = user.login_id.clone().unwrap_or_default();
        let name = extract_lastname_from_email(&email);

        let student_info = StudentInfo {
            group: user_to_group.get(&user.id).cloned(),
            full_name: user.name.clone(),
            name,
            canvas_id: user.login_id.unwrap_or_default(),
            git_id,
            email,
        };

        student_infos.push(student_info);
    }

    Ok(StudentInfoResult {
        students: student_infos,
        groups,
    })
}

/// Extract lastname from email (e.g., "john.doe@uni.nl" -> "doe")
fn extract_lastname_from_email(email: &str) -> String {
    email
        .split('@')
        .next()
        .unwrap_or("")
        .split('.')
        .next_back()
        .unwrap_or("")
        .to_string()
}
