//! Canvas API endpoint definitions
//!
//! This module provides constants and utilities for Canvas API endpoints.
//! It serves as a reference for the available API endpoints and can be
//! extended to support additional Canvas API features.

/// Base API version
pub const API_VERSION: &str = "v1";

/// Course endpoints
pub mod courses {
    /// List courses for the current user
    pub const LIST: &str = "courses";

    /// Get a single course
    pub fn get(course_id: &str) -> String {
        format!("courses/{}", course_id)
    }

    /// List users in a course
    pub fn users(course_id: &str) -> String {
        format!("courses/{}/users", course_id)
    }

    /// List groups in a course
    pub fn groups(course_id: &str) -> String {
        format!("courses/{}/groups", course_id)
    }

    /// List assignments in a course
    pub fn assignments(course_id: &str) -> String {
        format!("courses/{}/assignments", course_id)
    }

    /// List enrollments in a course
    pub fn enrollments(course_id: &str) -> String {
        format!("courses/{}/enrollments", course_id)
    }
}

/// User endpoints
pub mod users {
    /// Get the current user
    pub const SELF: &str = "users/self";

    /// Get a specific user
    pub fn get(user_id: &str) -> String {
        format!("users/{}", user_id)
    }

    /// Get user's courses
    pub fn courses(user_id: &str) -> String {
        format!("users/{}/courses", user_id)
    }

    /// Get user's profile
    pub fn profile(user_id: &str) -> String {
        format!("users/{}/profile", user_id)
    }
}

/// Assignment endpoints
pub mod assignments {
    /// Get a specific assignment
    pub fn get(course_id: &str, assignment_id: &str) -> String {
        format!("courses/{}/assignments/{}", course_id, assignment_id)
    }

    /// Get submissions for an assignment
    pub fn submissions(course_id: &str, assignment_id: &str) -> String {
        format!(
            "courses/{}/assignments/{}/submissions",
            course_id, assignment_id
        )
    }

    /// Get a specific submission
    pub fn submission(course_id: &str, assignment_id: &str, user_id: &str) -> String {
        format!(
            "courses/{}/assignments/{}/submissions/{}",
            course_id, assignment_id, user_id
        )
    }
}

/// Group endpoints
pub mod groups {
    /// Get a specific group
    pub fn get(group_id: &str) -> String {
        format!("groups/{}", group_id)
    }

    /// Get users in a group
    pub fn users(group_id: &str) -> String {
        format!("groups/{}/users", group_id)
    }
}

/// Enrollment endpoints
pub mod enrollments {
    /// List enrollments for a course
    pub fn course(course_id: &str) -> String {
        format!("courses/{}/enrollments", course_id)
    }

    /// List enrollments for a user
    pub fn user(user_id: &str) -> String {
        format!("users/{}/enrollments", user_id)
    }
}

/// Group category endpoints
pub mod group_categories {
    /// List group categories in a course
    pub fn list(course_id: &str) -> String {
        format!("courses/{}/group_categories", course_id)
    }

    /// Get a specific group category
    pub fn get(group_category_id: &str) -> String {
        format!("group_categories/{}", group_category_id)
    }

    /// List groups in a group category
    pub fn groups(group_category_id: &str) -> String {
        format!("group_categories/{}/groups", group_category_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_course_endpoints() {
        assert_eq!(courses::get("123"), "courses/123");
        assert_eq!(courses::users("123"), "courses/123/users");
        assert_eq!(courses::groups("123"), "courses/123/groups");
        assert_eq!(courses::assignments("123"), "courses/123/assignments");
    }

    #[test]
    fn test_user_endpoints() {
        assert_eq!(users::get("456"), "users/456");
        assert_eq!(users::courses("456"), "users/456/courses");
    }

    #[test]
    fn test_assignment_endpoints() {
        assert_eq!(
            assignments::get("123", "789"),
            "courses/123/assignments/789"
        );
        assert_eq!(
            assignments::submissions("123", "789"),
            "courses/123/assignments/789/submissions"
        );
    }

    #[test]
    fn test_group_category_endpoints() {
        assert_eq!(
            group_categories::list("123"),
            "courses/123/group_categories"
        );
        assert_eq!(group_categories::get("456"), "group_categories/456");
        assert_eq!(
            group_categories::groups("456"),
            "group_categories/456/groups"
        );
    }
}
