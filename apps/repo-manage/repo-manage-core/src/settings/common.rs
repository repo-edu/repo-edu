use super::enums::{DirectoryLayout, LmsUrlOption, MemberOption};
use super::normalization::{normalize_string, normalize_url, Normalize};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Common settings shared between GUI and CLI
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CommonSettings {
    // ===== LMS Settings =====
    #[serde(default = "defaults::lms_type")]
    pub lms_type: String, // "Canvas" or "Moodle"

    // ===== LMS Settings =====
    #[serde(default = "defaults::lms_base_url")]
    pub lms_base_url: String,

    #[serde(default)]
    pub lms_custom_url: String,

    #[serde(default = "defaults::lms_url_option")]
    pub lms_url_option: LmsUrlOption, // TUE or Custom

    #[serde(default)]
    pub lms_access_token: String,

    #[serde(default)]
    pub lms_course_id: String,

    #[serde(default)]
    pub lms_course_name: String,

    #[serde(default = "defaults::lms_yaml_file")]
    pub lms_yaml_file: String,

    #[serde(default)]
    pub lms_info_folder: String,

    #[serde(default = "defaults::lms_csv_file")]
    pub lms_csv_file: String,

    #[serde(default = "defaults::lms_xlsx_file")]
    pub lms_xlsx_file: String,

    #[serde(default = "defaults::lms_member_option")]
    pub lms_member_option: MemberOption, // EmailAndGitId, Email, GitId

    #[serde(default = "defaults::lms_include_group")]
    pub lms_include_group: bool,

    #[serde(default = "defaults::lms_include_member")]
    pub lms_include_member: bool,

    #[serde(default)]
    pub lms_include_initials: bool,

    #[serde(default = "defaults::lms_full_groups")]
    pub lms_full_groups: bool,

    #[serde(default)]
    pub lms_output_csv: bool,

    #[serde(default)]
    pub lms_output_xlsx: bool,

    #[serde(default = "defaults::lms_output_yaml")]
    pub lms_output_yaml: bool,

    // ===== Git Platform Settings =====
    #[serde(default = "defaults::git_base_url")]
    pub git_base_url: String,

    #[serde(default)]
    pub git_access_token: String,

    #[serde(default)]
    pub git_user: String,

    #[serde(default)]
    pub git_student_repos_group: String,

    #[serde(default)]
    pub git_template_group: String,

    // ===== Repository Setup Settings =====
    #[serde(default = "defaults::yaml_file")]
    pub yaml_file: String,

    #[serde(default)]
    pub target_folder: String,

    #[serde(default)]
    pub assignments: String,

    #[serde(default = "defaults::directory_layout")]
    pub directory_layout: DirectoryLayout, // ByTeam, Flat, ByTask

    // ===== Logging Settings =====
    #[serde(default = "defaults::log_info")]
    pub log_info: bool,

    #[serde(default)]
    pub log_debug: bool,

    #[serde(default = "defaults::log_warning")]
    pub log_warning: bool,

    #[serde(default = "defaults::log_error")]
    pub log_error: bool,
}

impl Default for CommonSettings {
    fn default() -> Self {
        Self {
            // LMS settings
            lms_type: defaults::lms_type(),

            // LMS settings
            lms_base_url: defaults::lms_base_url(),
            lms_custom_url: String::new(),
            lms_url_option: defaults::lms_url_option(),
            lms_access_token: String::new(),
            lms_course_id: String::new(),
            lms_course_name: String::new(),
            lms_yaml_file: defaults::lms_yaml_file(),
            lms_info_folder: String::new(),
            lms_csv_file: defaults::lms_csv_file(),
            lms_xlsx_file: defaults::lms_xlsx_file(),
            lms_member_option: defaults::lms_member_option(),
            lms_include_group: defaults::lms_include_group(),
            lms_include_member: defaults::lms_include_member(),
            lms_include_initials: false,
            lms_full_groups: defaults::lms_full_groups(),
            lms_output_csv: false,
            lms_output_xlsx: false,
            lms_output_yaml: defaults::lms_output_yaml(),

            // Git platform settings
            git_base_url: defaults::git_base_url(),
            git_access_token: String::new(),
            git_user: String::new(),
            git_student_repos_group: String::new(),
            git_template_group: String::new(),

            // Repository setup settings
            yaml_file: defaults::yaml_file(),
            target_folder: String::new(),
            assignments: String::new(),
            directory_layout: defaults::directory_layout(),

            // Logging settings
            log_info: defaults::log_info(),
            log_debug: false,
            log_warning: defaults::log_warning(),
            log_error: defaults::log_error(),
        }
    }
}

/// Default values for settings
mod defaults {
    use super::{DirectoryLayout, LmsUrlOption, MemberOption};

    pub fn lms_type() -> String {
        "Canvas".to_string()
    }

    pub fn lms_base_url() -> String {
        "https://canvas.tue.nl".to_string()
    }

    pub fn lms_url_option() -> LmsUrlOption {
        LmsUrlOption::TUE
    }

    pub fn lms_yaml_file() -> String {
        "students.yaml".to_string()
    }

    pub fn lms_csv_file() -> String {
        "student-info.csv".to_string()
    }

    pub fn lms_xlsx_file() -> String {
        "student-info.xlsx".to_string()
    }

    pub fn lms_member_option() -> MemberOption {
        MemberOption::EmailAndGitId
    }

    pub fn lms_include_group() -> bool {
        true
    }

    pub fn lms_include_member() -> bool {
        true
    }

    pub fn lms_full_groups() -> bool {
        true
    }

    pub fn lms_output_yaml() -> bool {
        true
    }

    pub fn git_base_url() -> String {
        "https://gitlab.tue.nl".to_string()
    }

    pub fn yaml_file() -> String {
        "students.yaml".to_string()
    }

    pub fn directory_layout() -> DirectoryLayout {
        DirectoryLayout::Flat
    }

    pub fn log_info() -> bool {
        true
    }

    pub fn log_warning() -> bool {
        true
    }

    pub fn log_error() -> bool {
        true
    }
}

impl Normalize for CommonSettings {
    fn normalize(&mut self) {
        // Normalize URL fields
        normalize_url(&mut self.lms_base_url);
        normalize_url(&mut self.lms_custom_url);
        normalize_url(&mut self.git_base_url);

        // Normalize string fields
        normalize_string(&mut self.lms_access_token);
        normalize_string(&mut self.lms_course_id);
        normalize_string(&mut self.lms_course_name);
        normalize_string(&mut self.lms_yaml_file);
        normalize_string(&mut self.lms_info_folder);
        normalize_string(&mut self.lms_csv_file);
        normalize_string(&mut self.lms_xlsx_file);
        normalize_string(&mut self.git_access_token);
        normalize_string(&mut self.git_user);
        normalize_string(&mut self.git_student_repos_group);
        normalize_string(&mut self.git_template_group);
        normalize_string(&mut self.yaml_file);
        normalize_string(&mut self.target_folder);
        normalize_string(&mut self.assignments);
    }
}
