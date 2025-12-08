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
    pub student_repos_group: String,
    pub template_group: String,
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
