//! Moodle-specific data models
//!
//! These models map Moodle Web Services API responses to the common LMS types.

use chrono::DateTime;
use lms_common::types::{Assignment, Course, Group, GroupMembership, User};
use serde::{Deserialize, Serialize};

/// Moodle course model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodleCourse {
    pub id: u64,
    pub shortname: String,
    pub fullname: String,
    pub displayname: Option<String>,
    pub enrolledusercount: Option<u32>,
    pub idnumber: Option<String>,
    pub visible: Option<u8>,
    pub summary: Option<String>,
    pub summaryformat: Option<u8>,
    pub format: Option<String>,
    pub showgrades: Option<u8>,
    pub newsitems: Option<u8>,
    pub startdate: Option<u64>,
    pub enddate: Option<u64>,
    pub maxbytes: Option<u64>,
    pub showreports: Option<u8>,
    pub lang: Option<String>,
    pub theme: Option<String>,
    pub marker: Option<u64>,
    pub legacyfiles: Option<u8>,
    pub calendartype: Option<String>,
    pub timecreated: Option<u64>,
    pub timemodified: Option<u64>,
    pub requested: Option<u8>,
    pub enablecompletion: Option<u8>,
    pub completionnotify: Option<u8>,
    pub categorysortorder: Option<u64>,
}

impl From<MoodleCourse> for Course {
    fn from(moodle: MoodleCourse) -> Self {
        Course {
            id: moodle.id.to_string(),
            name: moodle.fullname,
            course_code: Some(moodle.shortname),
            description: moodle.summary,
            enrollment_term_id: None,
            start_at: moodle
                .startdate
                .map(|ts| DateTime::from_timestamp(ts as i64, 0).unwrap_or_default()),
            end_at: moodle
                .enddate
                .map(|ts| DateTime::from_timestamp(ts as i64, 0).unwrap_or_default()),
            workflow_state: moodle.visible.map(|v| {
                if v == 1 {
                    "available".to_string()
                } else {
                    "hidden".to_string()
                }
            }),
            is_public: moodle.visible.map(|v| v == 1),
            total_students: moodle.enrolledusercount,
        }
    }
}

/// Moodle site info response (current user metadata)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodleSiteInfo {
    pub userid: u64,
    pub username: Option<String>,
    pub firstname: Option<String>,
    pub lastname: Option<String>,
    pub fullname: Option<String>,
    pub userpictureurl: Option<String>,
    #[serde(alias = "useremail")]
    pub email: Option<String>,
}

impl From<MoodleSiteInfo> for User {
    fn from(info: MoodleSiteInfo) -> Self {
        let fallback_name = match (&info.firstname, &info.lastname) {
            (Some(first), Some(last)) if !first.is_empty() || !last.is_empty() => {
                format!("{} {}", first, last).trim().to_string()
            }
            (Some(first), None) => first.clone(),
            (None, Some(last)) => last.clone(),
            _ => info
                .username
                .clone()
                .unwrap_or_else(|| info.userid.to_string()),
        };

        let name = info.fullname.clone().unwrap_or(fallback_name);

        User {
            id: info.userid.to_string(),
            name: name.clone(),
            sortable_name: Some(format!(
                "{}, {}",
                info.lastname.as_deref().unwrap_or(""),
                info.firstname.as_deref().unwrap_or("")
            )),
            short_name: info.username.clone().or_else(|| Some(name.clone())),
            login_id: info.username,
            email: info.email,
            avatar_url: info.userpictureurl,
            enrollments: None,
        }
    }
}

/// Moodle user model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodleUser {
    pub id: u64,
    pub username: Option<String>,
    pub firstname: Option<String>,
    pub lastname: Option<String>,
    pub fullname: String,
    pub email: Option<String>,
    pub department: Option<String>,
    pub firstaccess: Option<u64>,
    pub lastaccess: Option<u64>,
    pub auth: Option<String>,
    pub suspended: Option<u8>,
    pub confirmed: Option<u8>,
    pub lang: Option<String>,
    pub theme: Option<String>,
    pub timezone: Option<String>,
    pub description: Option<String>,
    pub descriptionformat: Option<u8>,
    pub profileimageurlsmall: Option<String>,
    pub profileimageurl: Option<String>,
}

impl From<MoodleUser> for User {
    fn from(moodle: MoodleUser) -> Self {
        User {
            id: moodle.id.to_string(),
            name: moodle.fullname.clone(),
            sortable_name: Some(format!(
                "{}, {}",
                moodle.lastname.as_deref().unwrap_or(""),
                moodle.firstname.as_deref().unwrap_or("")
            )),
            short_name: Some(moodle.fullname),
            login_id: moodle.username,
            email: moodle.email,
            avatar_url: moodle.profileimageurl,
            enrollments: None,
        }
    }
}

/// Moodle group model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodleGroup {
    pub id: u64,
    pub courseid: u64,
    pub name: String,
    pub description: Option<String>,
    pub descriptionformat: Option<u8>,
    pub enrolmentkey: Option<String>,
    pub idnumber: Option<String>,
    pub timecreated: Option<u64>,
    pub timemodified: Option<u64>,
}

impl From<MoodleGroup> for Group {
    fn from(moodle: MoodleGroup) -> Self {
        Group {
            id: moodle.id.to_string(),
            name: moodle.name,
            description: moodle.description,
            course_id: Some(moodle.courseid.to_string()),
            members_count: None,
            group_category_id: None,
            is_public: None,
            join_level: None,
            max_membership: None,
        }
    }
}

/// Moodle assignment model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodleAssignment {
    pub id: u64,
    pub course: u64,
    pub name: String,
    pub intro: Option<String>,
    pub introformat: Option<u8>,
    pub alwaysshowdescription: Option<u8>,
    pub nosubmissions: Option<u8>,
    pub submissiondrafts: Option<u8>,
    pub sendnotifications: Option<u8>,
    pub sendlatenotifications: Option<u8>,
    pub duedate: Option<u64>,
    pub allowsubmissionsfromdate: Option<u64>,
    pub grade: Option<f64>,
    pub timemodified: Option<u64>,
    pub completionsubmit: Option<u8>,
    pub cutoffdate: Option<u64>,
    pub gradingduedate: Option<u64>,
    pub teamsubmission: Option<u8>,
    pub requireallteammemberssubmit: Option<u8>,
    pub teamsubmissiongroupingid: Option<u64>,
    pub blindmarking: Option<u8>,
    pub hidegrader: Option<u8>,
    pub revealidentities: Option<u8>,
    pub attemptreopenmethod: Option<String>,
    pub maxattempts: Option<i64>,
    pub markingworkflow: Option<u8>,
    pub markingallocation: Option<u8>,
    pub requiresubmissionstatement: Option<u8>,
    pub preventsubmissionnotingroup: Option<u8>,
    pub configs: Option<Vec<serde_json::Value>>,
}

impl From<MoodleAssignment> for Assignment {
    fn from(moodle: MoodleAssignment) -> Self {
        Assignment {
            id: moodle.id.to_string(),
            name: moodle.name,
            description: moodle.intro,
            course_id: moodle.course.to_string(),
            due_at: moodle
                .duedate
                .map(|ts| DateTime::from_timestamp(ts as i64, 0).unwrap_or_default()),
            unlock_at: moodle
                .allowsubmissionsfromdate
                .map(|ts| DateTime::from_timestamp(ts as i64, 0).unwrap_or_default()),
            lock_at: moodle
                .cutoffdate
                .map(|ts| DateTime::from_timestamp(ts as i64, 0).unwrap_or_default()),
            points_possible: moodle.grade,
            position: None,
            submission_types: None,
            has_submitted_submissions: None,
            assignment_group_id: None,
            published: Some(true), // Moodle doesn't have unpublished assignments in the same way
            grading_type: Some("points".to_string()),
            group_category_id: moodle.teamsubmissiongroupingid.map(|id| id.to_string()),
        }
    }
}

/// Moodle enrolled user (for course enrollment)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodleEnrolledUser {
    pub id: u64,
    pub username: Option<String>,
    pub firstname: Option<String>,
    pub lastname: Option<String>,
    pub fullname: Option<String>,
    pub email: Option<String>,
    pub roles: Option<Vec<MoodleRole>>,
    pub groups: Option<Vec<MoodleGroupInfo>>,
}

/// Moodle role information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodleRole {
    pub roleid: u64,
    pub name: Option<String>,
    pub shortname: Option<String>,
    pub sortorder: Option<u64>,
}

/// Moodle group information (minimal)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodleGroupInfo {
    pub id: u64,
    pub name: String,
    pub description: Option<String>,
}

impl From<MoodleEnrolledUser> for User {
    fn from(moodle: MoodleEnrolledUser) -> Self {
        User {
            id: moodle.id.to_string(),
            name: moodle.fullname.unwrap_or_else(|| {
                format!(
                    "{} {}",
                    moodle.firstname.as_deref().unwrap_or(""),
                    moodle.lastname.as_deref().unwrap_or("")
                )
                .trim()
                .to_string()
            }),
            sortable_name: Some(format!(
                "{}, {}",
                moodle.lastname.as_deref().unwrap_or(""),
                moodle.firstname.as_deref().unwrap_or("")
            )),
            short_name: moodle.username.clone(),
            login_id: moodle.username,
            email: moodle.email,
            avatar_url: None,
            enrollments: None,
        }
    }
}

/// Moodle group membership model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoodleGroupMembership {
    pub id: u64,
    pub groupid: u64,
    pub userid: u64,
}

impl From<MoodleGroupMembership> for GroupMembership {
    fn from(moodle: MoodleGroupMembership) -> Self {
        GroupMembership {
            id: moodle.id.to_string(),
            user_id: moodle.userid.to_string(),
            group_id: moodle.groupid.to_string(),
            workflow_state: Some("accepted".to_string()), // Moodle doesn't have workflow states
        }
    }
}
