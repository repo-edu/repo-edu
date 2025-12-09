use super::enums::{DirectoryLayout, LmsUrlOption, MemberOption};
use super::normalization::{normalize_string, normalize_url, Normalize};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Shared settings used by multiple apps (git credentials)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct CommonSettings {
    pub git_access_token: String,
    pub git_base_url: String,
    pub git_user: String,
}

impl Default for CommonSettings {
    fn default() -> Self {
        Self {
            git_access_token: String::new(),
            git_base_url: "https://gitlab.tue.nl".to_string(),
            git_user: String::new(),
        }
    }
}

impl Normalize for CommonSettings {
    fn normalize(&mut self) {
        normalize_string(&mut self.git_access_token);
        normalize_url(&mut self.git_base_url);
        normalize_string(&mut self.git_user);
    }
}

/// LMS app settings (Tab 1)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct LmsSettings {
    pub access_token: String,
    pub base_url: String,
    pub course_id: String,
    pub course_name: String,
    pub csv_file: String,
    pub custom_url: String,
    pub full_groups: bool,
    pub include_group: bool,
    pub include_initials: bool,
    pub include_member: bool,
    pub member_option: MemberOption,
    pub output_csv: bool,
    pub output_folder: String,
    pub output_xlsx: bool,
    pub output_yaml: bool,
    #[serde(rename = "type")]
    pub r#type: String, // "Canvas" or "Moodle"
    pub url_option: LmsUrlOption,
    pub xlsx_file: String,
    pub yaml_file: String,
}

impl Default for LmsSettings {
    fn default() -> Self {
        Self {
            access_token: String::new(),
            base_url: "https://canvas.tue.nl".to_string(),
            course_id: String::new(),
            course_name: String::new(),
            csv_file: "student-info.csv".to_string(),
            custom_url: String::new(),
            full_groups: true,
            include_group: true,
            include_initials: false,
            include_member: true,
            member_option: MemberOption::EmailAndGitId,
            output_csv: false,
            output_folder: String::new(),
            output_xlsx: false,
            output_yaml: true,
            r#type: "Canvas".to_string(),
            url_option: LmsUrlOption::TUE,
            xlsx_file: "student-info.xlsx".to_string(),
            yaml_file: "students.yaml".to_string(),
        }
    }
}

impl Normalize for LmsSettings {
    fn normalize(&mut self) {
        normalize_string(&mut self.access_token);
        normalize_url(&mut self.base_url);
        normalize_string(&mut self.course_id);
        normalize_string(&mut self.course_name);
        normalize_string(&mut self.csv_file);
        normalize_url(&mut self.custom_url);
        normalize_string(&mut self.output_folder);
        normalize_string(&mut self.xlsx_file);
        normalize_string(&mut self.yaml_file);
    }
}

/// Repo app settings (Tab 2)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct RepoSettings {
    pub assignments: String,
    pub directory_layout: DirectoryLayout,
    pub student_repos_group: String,
    pub target_folder: String,
    pub template_group: String,
    pub yaml_file: String,
}

impl Default for RepoSettings {
    fn default() -> Self {
        Self {
            assignments: String::new(),
            directory_layout: DirectoryLayout::Flat,
            student_repos_group: String::new(),
            target_folder: String::new(),
            template_group: String::new(),
            yaml_file: "students.yaml".to_string(),
        }
    }
}

impl Normalize for RepoSettings {
    fn normalize(&mut self) {
        normalize_string(&mut self.assignments);
        normalize_string(&mut self.student_repos_group);
        normalize_string(&mut self.target_folder);
        normalize_string(&mut self.template_group);
        normalize_string(&mut self.yaml_file);
    }
}

/// Logging settings (stored in AppSettings)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct LogSettings {
    pub debug: bool,
    pub error: bool,
    pub info: bool,
    pub warning: bool,
}

impl Default for LogSettings {
    fn default() -> Self {
        Self {
            debug: false,
            error: true,
            info: true,
            warning: true,
        }
    }
}

/// Profile settings (nested structure for per-profile data)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type, Default)]
pub struct ProfileSettings {
    pub common: CommonSettings,
    pub lms: LmsSettings,
    pub repo: RepoSettings,
}

impl Normalize for ProfileSettings {
    fn normalize(&mut self) {
        self.common.normalize();
        self.lms.normalize();
        self.repo.normalize();
    }
}
