use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct VerifyCourseParams {
    pub base_url: String,
    pub access_token: String,
    pub course_id: String,
    pub lms_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
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

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ConfigParams {
    pub access_token: String,
    pub user: String,
    pub base_url: String,
    pub student_repos: String,
    pub template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SetupParams {
    pub config: ConfigParams,
    pub yaml_file: String,
    pub assignments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct CloneParams {
    pub config: ConfigParams,
    pub yaml_file: String,
    pub assignments: String,
    pub target_folder: String,
    pub directory_layout: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct CommandResult {
    pub success: bool,
    pub message: String,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct VerifyCourseResult {
    pub course_id: String,
    pub course_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct GetGroupCategoriesParams {
    pub base_url: String,
    pub access_token: String,
    pub course_id: String,
    pub lms_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct GetGroupsParams {
    pub base_url: String,
    pub access_token: String,
    pub course_id: String,
    pub lms_type: String,
    pub group_category_id: Option<String>,
}

/// Group category (group set) for frontend binding
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
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

/// Group for frontend binding
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub group_category_id: Option<String>,
    pub members_count: Option<u32>,
}

impl From<repo_manage_core::Group> for Group {
    fn from(g: repo_manage_core::Group) -> Self {
        Group {
            id: g.id,
            name: g.name,
            group_category_id: g.group_category_id,
            members_count: g.members_count,
        }
    }
}
