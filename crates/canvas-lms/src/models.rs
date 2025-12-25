//! Canvas-specific data models
//!
//! These models map Canvas API responses to the common LMS types.

use chrono::{DateTime, Utc};
use lms_common::types::{
    Assignment, Course, Enrollment, Group, GroupCategory, GroupMembership, Submission, User,
};
use serde::{Deserialize, Serialize};

/// Canvas course model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasCourse {
    pub id: u64,
    pub name: String,
    pub account_id: Option<u64>,
    pub uuid: Option<String>,
    pub start_at: Option<DateTime<Utc>>,
    pub grading_standard_id: Option<u64>,
    pub is_public: Option<bool>,
    pub created_at: Option<DateTime<Utc>>,
    pub course_code: Option<String>,
    pub default_view: Option<String>,
    pub root_account_id: Option<u64>,
    pub enrollment_term_id: Option<u64>,
    pub license: Option<String>,
    pub grade_passback_setting: Option<String>,
    pub end_at: Option<DateTime<Utc>>,
    pub public_syllabus: Option<bool>,
    pub public_syllabus_to_auth: Option<bool>,
    pub storage_quota_mb: Option<u64>,
    pub is_public_to_auth_users: Option<bool>,
    pub apply_assignment_group_weights: Option<bool>,
    pub calendar: Option<serde_json::Value>,
    pub time_zone: Option<String>,
    pub blueprint: Option<bool>,
    pub sis_course_id: Option<String>,
    pub sis_import_id: Option<u64>,
    pub integration_id: Option<String>,
    pub enrollments: Option<Vec<CanvasEnrollment>>,
    pub hide_final_grades: Option<bool>,
    pub workflow_state: Option<String>,
    pub restrict_enrollments_to_course_dates: Option<bool>,
    pub total_students: Option<u32>,
}

impl From<CanvasCourse> for Course {
    fn from(canvas: CanvasCourse) -> Self {
        Course {
            id: canvas.id.to_string(),
            name: canvas.name,
            course_code: canvas.course_code,
            description: None, // Canvas doesn't include description in list view
            enrollment_term_id: canvas.enrollment_term_id.map(|id| id.to_string()),
            start_at: canvas.start_at,
            end_at: canvas.end_at,
            workflow_state: canvas.workflow_state,
            is_public: canvas.is_public,
            total_students: canvas.total_students,
        }
    }
}

/// Canvas group model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasGroup {
    pub id: u64,
    pub name: String,
    pub description: Option<String>,
    pub is_public: Option<bool>,
    pub followed_by_user: Option<bool>,
    pub join_level: Option<String>,
    pub members_count: Option<u32>,
    pub avatar_url: Option<String>,
    pub context_type: Option<String>,
    pub course_id: Option<u64>,
    pub role: Option<String>,
    pub group_category_id: Option<u64>,
    /// Group category name (included with include[]=group_category)
    pub group_category: Option<CanvasGroupCategoryRef>,
    pub sis_group_id: Option<String>,
    pub sis_import_id: Option<u64>,
    pub storage_quota_mb: Option<u64>,
    pub permissions: Option<serde_json::Value>,
    pub max_membership: Option<u32>,
}

/// Reference to group category included in group response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasGroupCategoryRef {
    pub id: u64,
    pub name: String,
}

impl From<CanvasGroup> for Group {
    fn from(canvas: CanvasGroup) -> Self {
        Group {
            id: canvas.id.to_string(),
            name: canvas.name,
            description: canvas.description,
            course_id: canvas.course_id.map(|id| id.to_string()),
            members_count: canvas.members_count,
            group_category_id: canvas.group_category_id.map(|id| id.to_string()),
            is_public: canvas.is_public,
            join_level: canvas.join_level,
            max_membership: canvas.max_membership,
        }
    }
}

/// Canvas group membership model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasGroupMembership {
    pub id: u64,
    pub user_id: u64,
    pub group_id: u64,
    pub workflow_state: Option<String>,
    pub moderator: Option<bool>,
    pub just_created: Option<bool>,
    pub sis_import_id: Option<u64>,
}

impl From<CanvasGroupMembership> for GroupMembership {
    fn from(canvas: CanvasGroupMembership) -> Self {
        GroupMembership {
            id: canvas.id.to_string(),
            user_id: canvas.user_id.to_string(),
            group_id: canvas.group_id.to_string(),
            workflow_state: canvas.workflow_state,
        }
    }
}

/// Canvas group category model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasGroupCategory {
    pub id: u64,
    pub name: String,
    pub role: Option<String>,
    pub self_signup: Option<String>,
    pub context_type: Option<String>,
    pub course_id: Option<u64>,
    pub account_id: Option<u64>,
    pub group_limit: Option<u32>,
    pub auto_leader: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub sis_group_category_id: Option<String>,
    pub sis_import_id: Option<u64>,
}

impl From<CanvasGroupCategory> for GroupCategory {
    fn from(canvas: CanvasGroupCategory) -> Self {
        GroupCategory {
            id: canvas.id.to_string(),
            name: canvas.name,
            role: canvas.role,
            self_signup: canvas.self_signup,
            course_id: canvas.course_id.map(|id| id.to_string()),
            group_limit: canvas.group_limit,
        }
    }
}

/// Canvas user model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasUser {
    pub id: u64,
    pub name: String,
    pub sortable_name: Option<String>,
    pub short_name: Option<String>,
    pub sis_user_id: Option<String>,
    pub sis_import_id: Option<u64>,
    pub integration_id: Option<String>,
    pub login_id: Option<String>,
    pub avatar_url: Option<String>,
    pub enrollments: Option<Vec<CanvasEnrollment>>,
    pub email: Option<String>,
    pub locale: Option<String>,
    pub effective_locale: Option<String>,
    pub last_login: Option<DateTime<Utc>>,
    pub time_zone: Option<String>,
    pub bio: Option<String>,
}

impl From<CanvasUser> for User {
    fn from(canvas: CanvasUser) -> Self {
        User {
            id: canvas.id.to_string(),
            name: canvas.name,
            sortable_name: canvas.sortable_name,
            short_name: canvas.short_name,
            login_id: canvas.login_id,
            email: canvas.email,
            avatar_url: canvas.avatar_url,
            enrollments: canvas
                .enrollments
                .map(|enrollments| enrollments.into_iter().map(|e| e.into()).collect()),
        }
    }
}

/// Canvas enrollment model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasEnrollment {
    pub id: Option<u64>,
    pub user_id: Option<u64>,
    pub course_id: Option<u64>,
    pub course_section_id: Option<u64>,
    #[serde(rename = "type")]
    pub enrollment_type: String,
    pub role: Option<String>,
    pub role_id: Option<u64>,
    pub enrollment_state: Option<String>,
    pub limit_privileges_to_course_section: Option<bool>,
    pub sis_account_id: Option<String>,
    pub sis_course_id: Option<String>,
    pub sis_section_id: Option<String>,
    pub sis_user_id: Option<String>,
    pub html_url: Option<String>,
    pub grades: Option<serde_json::Value>,
    pub user: Option<CanvasUser>,
    pub associated_user_id: Option<u64>,
}

impl From<CanvasEnrollment> for Enrollment {
    fn from(canvas: CanvasEnrollment) -> Self {
        Enrollment {
            id: canvas
                .id
                .map(|id| id.to_string())
                .unwrap_or_else(|| "0".to_string()),
            user_id: canvas
                .user_id
                .map(|id| id.to_string())
                .unwrap_or_else(|| "0".to_string()),
            course_id: canvas
                .course_id
                .map(|id| id.to_string())
                .unwrap_or_else(|| "0".to_string()),
            enrollment_type: canvas.enrollment_type,
            role: canvas.role,
            enrollment_state: canvas.enrollment_state,
            limit_privileges_to_course_section: canvas.limit_privileges_to_course_section,
        }
    }
}

/// Canvas assignment model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasAssignment {
    pub id: u64,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub due_at: Option<DateTime<Utc>>,
    pub lock_at: Option<DateTime<Utc>>,
    pub unlock_at: Option<DateTime<Utc>>,
    pub has_overrides: Option<bool>,
    pub course_id: u64,
    pub html_url: Option<String>,
    pub submissions_download_url: Option<String>,
    pub assignment_group_id: Option<u64>,
    pub due_date_required: Option<bool>,
    pub allowed_extensions: Option<Vec<String>>,
    pub max_name_length: Option<u32>,
    pub turnitin_enabled: Option<bool>,
    pub vericite_enabled: Option<bool>,
    pub turnitin_settings: Option<serde_json::Value>,
    pub grade_group_students_individually: Option<bool>,
    pub external_tool_tag_attributes: Option<serde_json::Value>,
    pub peer_reviews: Option<bool>,
    pub automatic_peer_reviews: Option<bool>,
    pub peer_review_count: Option<u32>,
    pub peer_reviews_assign_at: Option<DateTime<Utc>>,
    pub intra_group_peer_reviews: Option<bool>,
    pub group_category_id: Option<u64>,
    pub needs_grading_count: Option<u32>,
    pub needs_grading_count_by_section: Option<Vec<serde_json::Value>>,
    pub position: Option<u32>,
    pub post_to_sis: Option<bool>,
    pub integration_id: Option<String>,
    pub integration_data: Option<serde_json::Value>,
    pub points_possible: Option<f64>,
    pub submission_types: Option<Vec<String>>,
    pub has_submitted_submissions: Option<bool>,
    pub grading_type: Option<String>,
    pub grading_standard_id: Option<u64>,
    pub published: Option<bool>,
    pub unpublishable: Option<bool>,
    pub only_visible_to_overrides: Option<bool>,
    pub locked_for_user: Option<bool>,
    pub lock_info: Option<serde_json::Value>,
    pub lock_explanation: Option<String>,
}

impl From<CanvasAssignment> for Assignment {
    fn from(canvas: CanvasAssignment) -> Self {
        Assignment {
            id: canvas.id.to_string(),
            name: canvas.name,
            description: canvas.description,
            course_id: canvas.course_id.to_string(),
            due_at: canvas.due_at,
            unlock_at: canvas.unlock_at,
            lock_at: canvas.lock_at,
            points_possible: canvas.points_possible,
            position: canvas.position,
            submission_types: canvas.submission_types,
            has_submitted_submissions: canvas.has_submitted_submissions,
            assignment_group_id: canvas.assignment_group_id.map(|id| id.to_string()),
            published: canvas.published,
            grading_type: canvas.grading_type,
            group_category_id: canvas.group_category_id.map(|id| id.to_string()),
        }
    }
}

/// Canvas submission model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasSubmission {
    pub id: u64,
    pub assignment_id: u64,
    pub assignment: Option<CanvasAssignment>,
    pub course: Option<CanvasCourse>,
    pub attempt: Option<u32>,
    pub body: Option<String>,
    pub grade: Option<String>,
    pub grade_matches_current_submission: Option<bool>,
    pub html_url: Option<String>,
    pub preview_url: Option<String>,
    pub score: Option<f64>,
    pub submission_comments: Option<Vec<serde_json::Value>>,
    pub submission_type: Option<String>,
    pub submitted_at: Option<DateTime<Utc>>,
    pub url: Option<String>,
    pub user_id: u64,
    pub grader_id: Option<u64>,
    pub graded_at: Option<DateTime<Utc>>,
    pub user: Option<CanvasUser>,
    pub late: Option<bool>,
    pub assignment_visible: Option<bool>,
    pub excused: Option<bool>,
    pub missing: Option<bool>,
    pub late_policy_status: Option<String>,
    pub points_deducted: Option<f64>,
    pub seconds_late: Option<u64>,
    pub workflow_state: Option<String>,
    pub extra_attempts: Option<u32>,
    pub anonymous_id: Option<String>,
}

impl From<CanvasSubmission> for Submission {
    fn from(canvas: CanvasSubmission) -> Self {
        Submission {
            id: canvas.id.to_string(),
            assignment_id: canvas.assignment_id.to_string(),
            user_id: canvas.user_id.to_string(),
            submission_type: canvas.submission_type,
            workflow_state: canvas.workflow_state,
            grade: canvas.grade,
            score: canvas.score,
            submitted_at: canvas.submitted_at,
            graded_at: canvas.graded_at,
            attempt: canvas.attempt,
            late: canvas.late,
            preview_url: canvas.preview_url,
        }
    }
}
