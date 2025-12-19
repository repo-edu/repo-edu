//! Common data types for LMS operations

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Represents a course in an LMS
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Course {
    /// Unique identifier for the course
    pub id: String,

    /// Course name
    pub name: String,

    /// Course code (e.g., "CS101")
    pub course_code: Option<String>,

    /// Course description
    pub description: Option<String>,

    /// Enrollment term ID
    pub enrollment_term_id: Option<String>,

    /// Start date of the course
    pub start_at: Option<DateTime<Utc>>,

    /// End date of the course
    pub end_at: Option<DateTime<Utc>>,

    /// Course workflow state (e.g., "available", "completed")
    pub workflow_state: Option<String>,

    /// Whether the course is public
    pub is_public: Option<bool>,

    /// Total number of students enrolled
    pub total_students: Option<u32>,
}

/// Represents a group within a course
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Group {
    /// Unique identifier for the group
    pub id: String,

    /// Group name
    pub name: String,

    /// Group description
    pub description: Option<String>,

    /// Course ID this group belongs to
    pub course_id: Option<String>,

    /// Number of members in the group
    pub members_count: Option<u32>,

    /// Group category ID
    pub group_category_id: Option<String>,

    /// Whether the group is public
    pub is_public: Option<bool>,

    /// Join level (e.g., "invitation_only", "parent_context_auto_join")
    pub join_level: Option<String>,

    /// Maximum membership count
    pub max_membership: Option<u32>,
}

/// Represents a user's membership in a group
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GroupMembership {
    /// Unique identifier for the membership
    pub id: String,

    /// User ID
    pub user_id: String,

    /// Group ID
    pub group_id: String,

    /// Workflow state (e.g., "accepted", "invited")
    pub workflow_state: Option<String>,
}

/// Represents a user in an LMS
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct User {
    /// Unique identifier for the user
    pub id: String,

    /// User's full name
    pub name: String,

    /// User's display name (sortable)
    pub sortable_name: Option<String>,

    /// User's short name
    pub short_name: Option<String>,

    /// User's login ID
    pub login_id: Option<String>,

    /// User's email address
    pub email: Option<String>,

    /// URL to user's avatar image
    pub avatar_url: Option<String>,

    /// User's role in the context (e.g., "StudentEnrollment", "TeacherEnrollment")
    pub enrollments: Option<Vec<Enrollment>>,
}

/// Represents an enrollment of a user in a course
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Enrollment {
    /// Enrollment ID
    pub id: String,

    /// User ID
    pub user_id: String,

    /// Course ID
    pub course_id: String,

    /// Enrollment type (e.g., "StudentEnrollment", "TeacherEnrollment", "TaEnrollment")
    #[serde(rename = "type")]
    pub enrollment_type: String,

    /// Enrollment role (e.g., "StudentEnrollment")
    pub role: Option<String>,

    /// Enrollment state (e.g., "active", "invited", "completed")
    pub enrollment_state: Option<String>,

    /// Whether the enrollment is associated with the user's account
    pub limit_privileges_to_course_section: Option<bool>,
}

/// Represents an assignment in a course
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Assignment {
    /// Unique identifier for the assignment
    pub id: String,

    /// Assignment name
    pub name: String,

    /// Assignment description (HTML)
    pub description: Option<String>,

    /// Course ID this assignment belongs to
    pub course_id: String,

    /// Due date for the assignment
    pub due_at: Option<DateTime<Utc>>,

    /// Unlock date (when assignment becomes available)
    pub unlock_at: Option<DateTime<Utc>>,

    /// Lock date (when assignment is no longer available)
    pub lock_at: Option<DateTime<Utc>>,

    /// Maximum points possible
    pub points_possible: Option<f64>,

    /// Position in the assignment list
    pub position: Option<u32>,

    /// Submission types allowed (e.g., ["online_text_entry", "online_upload"])
    pub submission_types: Option<Vec<String>>,

    /// Whether this assignment has submitted submissions
    pub has_submitted_submissions: Option<bool>,

    /// Assignment group ID
    pub assignment_group_id: Option<String>,

    /// Whether the assignment is published
    pub published: Option<bool>,

    /// Grading type (e.g., "points", "percent", "letter_grade")
    pub grading_type: Option<String>,

    /// Whether this is a group assignment
    pub group_category_id: Option<String>,
}

/// Represents a submission for an assignment
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Submission {
    /// Submission ID
    pub id: String,

    /// Assignment ID
    pub assignment_id: String,

    /// User ID
    pub user_id: String,

    /// Submission type (e.g., "online_text_entry", "online_upload")
    pub submission_type: Option<String>,

    /// Submission workflow state (e.g., "submitted", "graded")
    pub workflow_state: Option<String>,

    /// Grade given
    pub grade: Option<String>,

    /// Score received
    pub score: Option<f64>,

    /// When the submission was submitted
    pub submitted_at: Option<DateTime<Utc>>,

    /// When the submission was graded
    pub graded_at: Option<DateTime<Utc>>,

    /// Attempt number
    pub attempt: Option<u32>,

    /// Whether the submission is late
    pub late: Option<bool>,

    /// Preview URL for the submission
    pub preview_url: Option<String>,
}

/// Pagination information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationInfo {
    /// Current page number
    pub current_page: u32,

    /// Total number of pages
    pub total_pages: Option<u32>,

    /// Items per page
    pub per_page: u32,

    /// Total number of items
    pub total_count: Option<u32>,

    /// Next page URL
    pub next_url: Option<String>,

    /// Previous page URL
    pub prev_url: Option<String>,
}

impl Default for PaginationInfo {
    fn default() -> Self {
        Self {
            current_page: 1,
            total_pages: None,
            per_page: 100,
            total_count: None,
            next_url: None,
            prev_url: None,
        }
    }
}
