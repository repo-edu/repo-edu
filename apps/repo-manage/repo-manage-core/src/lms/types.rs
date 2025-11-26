use serde::{Deserialize, Serialize};
// Use lms-client re-exported types (from lms-common)
pub use lms_client::{Course, Group, GroupMembership, User};

/// Student information mapped from LMS
/// This is domain-specific to repobee and combines LMS data with Git identifiers
#[derive(Debug, Clone)]
pub struct StudentInfo {
    pub group: Option<Group>, // Now uses lms-common::Group with String ID
    pub full_name: String,
    pub name: String,      // Last name
    pub canvas_id: String, // login_id (keeping name for compatibility)
    pub git_id: String,    // sis_user_id or external identifier
    pub email: String,
}

/// Configuration for YAML generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YamlConfig {
    pub member_option: MemberOption,
    pub include_group: bool,
    pub include_member: bool,
    pub include_initials: bool,
    pub full_groups: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MemberOption {
    #[serde(rename = "(email, gitid)")]
    Both,
    #[serde(rename = "email")]
    Email,
    #[serde(rename = "git_id")]
    GitId,
}

impl MemberOption {
    pub fn from_str(s: &str) -> Self {
        match s {
            "(email, gitid)" => Self::Both,
            "email" => Self::Email,
            "git_id" => Self::GitId,
            _ => Self::Both,
        }
    }
}
