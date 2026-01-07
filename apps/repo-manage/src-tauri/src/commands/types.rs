use serde::{Deserialize, Serialize};

pub use crate::generated::types::CommandResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigParams {
    pub access_token: String,
    pub user: String,
    pub base_url: String,
    pub student_repos: String,
    pub template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloneParams {
    pub config: ConfigParams,
    pub yaml_file: String,
    pub assignments: String,
    pub target_folder: String,
    pub directory_layout: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupParams {
    pub config: ConfigParams,
    pub yaml_file: String,
    pub assignments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyCourseParams {
    pub base_url: String,
    pub access_token: String,
    pub course_id: String,
    pub lms_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyCourseResult {
    pub course_id: String,
    pub course_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateFilesParams {
    pub base_url: String,
    pub access_token: String,
    pub course_id: String,
    pub lms_type: String,
    pub yaml_file: String,
    pub output_folder: String,
    pub csv_file: String,
    pub xlsx_file: String,
    pub member_option: String,
    pub include_group: bool,
    pub include_member: bool,
    pub include_initials: bool,
    pub full_groups: bool,
    pub csv: bool,
    pub xlsx: bool,
    pub yaml: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetGroupCategoriesParams {
    pub base_url: String,
    pub access_token: String,
    pub course_id: String,
    pub lms_type: String,
    pub user_agent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupCategory {
    pub id: String,
    pub name: String,
    pub role: Option<String>,
    pub self_signup: Option<String>,
    pub course_id: Option<String>,
    pub group_limit: Option<u32>,
}

impl From<repo_manage_core::GroupCategory> for GroupCategory {
    fn from(gc: repo_manage_core::GroupCategory) -> Self {
        GroupCategory {
            id: gc.id,
            name: gc.name,
            role: gc.role,
            self_signup: gc.self_signup,
            course_id: gc.course_id,
            group_limit: gc.group_limit,
        }
    }
}
