//! Common data types for LMS operations

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Enrollment type classification for LMS users.
///
/// Maps Canvas enrollment types (e.g., "StudentEnrollment") and
/// Moodle role shortnames (e.g., "student") to a common enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub enum EnrollmentType {
    #[default]
    Student,
    Teacher,
    Ta,
    Designer,
    Observer,
    Other,
}

impl EnrollmentType {
    /// Convert a Canvas enrollment type string to an EnrollmentType.
    ///
    /// Canvas uses strings like "StudentEnrollment", "TeacherEnrollment", etc.
    pub fn from_canvas(enrollment_type: &str) -> Self {
        match enrollment_type {
            "StudentEnrollment" => Self::Student,
            "TeacherEnrollment" => Self::Teacher,
            "TaEnrollment" => Self::Ta,
            "DesignerEnrollment" => Self::Designer,
            "ObserverEnrollment" => Self::Observer,
            _ => Self::Other,
        }
    }

    /// Convert a Moodle role shortname to an EnrollmentType.
    ///
    /// Moodle uses shortnames like "student", "editingteacher", "teacher", etc.
    pub fn from_moodle(role_shortname: &str) -> Self {
        match role_shortname {
            "student" => Self::Student,
            "editingteacher" | "teacher" => Self::Teacher,
            "manager" | "coursecreator" => Self::Designer,
            _ => Self::Other,
        }
    }

    /// Check if this enrollment type represents a student.
    pub fn is_student(&self) -> bool {
        matches!(self, Self::Student)
    }

    /// Return a display string for this enrollment type.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Student => "student",
            Self::Teacher => "teacher",
            Self::Ta => "ta",
            Self::Designer => "designer",
            Self::Observer => "observer",
            Self::Other => "other",
        }
    }

    /// Convert Canvas enrollment_state to a display string.
    ///
    /// Canvas states: "active", "invited", "creation_pending", "deleted",
    /// "rejected", "completed", "inactive"
    pub fn canvas_enrollment_display(
        enrollment_type: &str,
        enrollment_state: Option<&str>,
    ) -> String {
        let type_label = Self::from_canvas(enrollment_type).as_str();
        match enrollment_state {
            Some("active") | None => type_label.to_string(),
            Some(state) => format!("{} ({})", type_label, state),
        }
    }

    /// Convert a Moodle role to a display string.
    pub fn moodle_enrollment_display(role_name: Option<&str>, role_shortname: &str) -> String {
        role_name
            .map(|n| n.to_string())
            .unwrap_or_else(|| Self::from_moodle(role_shortname).as_str().to_string())
    }
}

impl std::fmt::Display for EnrollmentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

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

/// Represents a group category (group set) in an LMS
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GroupCategory {
    /// Unique identifier for the group category
    pub id: String,

    /// Group category name
    pub name: String,

    /// Role: "communities", "student_organized", "imported", or null for custom
    pub role: Option<String>,

    /// Self-signup: "restricted", "enabled", or null
    pub self_signup: Option<String>,

    /// Course ID this category belongs to
    pub course_id: Option<String>,

    /// Maximum number of members per group
    pub group_limit: Option<u32>,
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

impl Enrollment {
    /// Convert the enrollment_type string to an EnrollmentType enum.
    pub fn enrollment_type_enum(&self) -> EnrollmentType {
        EnrollmentType::from_canvas(&self.enrollment_type)
    }
}

impl User {
    fn preferred_enrollment(&self) -> Option<&Enrollment> {
        self.enrollments.as_ref().and_then(|enrollments| {
            enrollments.iter().max_by_key(|enrollment| {
                let enrollment_type = enrollment.enrollment_type_enum();
                let type_priority = match enrollment_type {
                    EnrollmentType::Teacher => 6,
                    EnrollmentType::Ta => 5,
                    EnrollmentType::Designer => 4,
                    EnrollmentType::Observer => 3,
                    EnrollmentType::Other => 2,
                    EnrollmentType::Student => 1,
                };
                let state_priority = match enrollment.enrollment_state.as_deref() {
                    Some("active") | None => 2,
                    Some("invited") | Some("creation_pending") => 1,
                    _ => 0,
                };
                (state_priority, type_priority)
            })
        })
    }

    /// Get the primary enrollment type for this user.
    ///
    /// Prefers active non-student enrollments over student enrollments.
    pub fn primary_enrollment_type(&self) -> Option<EnrollmentType> {
        self.preferred_enrollment()
            .map(|enrollment| enrollment.enrollment_type_enum())
    }

    /// Get a display string for the primary enrollment.
    pub fn primary_enrollment_display(&self) -> Option<String> {
        self.preferred_enrollment().map(|e| {
            EnrollmentType::canvas_enrollment_display(
                &e.enrollment_type,
                e.enrollment_state.as_deref(),
            )
        })
    }

    /// Determine enrollment status from enrollment state.
    ///
    /// Returns "active", "dropped", or "incomplete" based on enrollment state.
    pub fn enrollment_status(&self) -> &'static str {
        self.preferred_enrollment()
            .map(|enrollment| match enrollment.enrollment_state.as_deref() {
                Some("active") | None => "active",
                Some("completed") | Some("deleted") | Some("inactive") => "dropped",
                _ => "incomplete",
            })
            .unwrap_or("active")
    }
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
