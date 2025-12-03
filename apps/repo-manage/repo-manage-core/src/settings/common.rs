use super::enums::{DirectoryLayout, LmsUrlOption, MemberOption};
use super::normalization::{normalize_string, normalize_url, Normalize};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Shared settings used by multiple apps (git credentials)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct CommonSettings {
    pub git_base_url: String,
    pub git_access_token: String,
    pub git_user: String,
}

impl Default for CommonSettings {
    fn default() -> Self {
        Self {
            git_base_url: "https://gitlab.tue.nl".to_string(),
            git_access_token: String::new(),
            git_user: String::new(),
        }
    }
}

impl Normalize for CommonSettings {
    fn normalize(&mut self) {
        normalize_url(&mut self.git_base_url);
        normalize_string(&mut self.git_access_token);
        normalize_string(&mut self.git_user);
    }
}

/// LMS app settings (Tab 1)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct LmsSettings {
    #[serde(rename = "type")]
    pub r#type: String, // "Canvas" or "Moodle"
    pub base_url: String,
    pub custom_url: String,
    pub url_option: LmsUrlOption,
    pub access_token: String,
    pub course_id: String,
    pub course_name: String,
    pub yaml_file: String,
    pub info_folder: String,
    pub csv_file: String,
    pub xlsx_file: String,
    pub member_option: MemberOption,
    pub include_group: bool,
    pub include_member: bool,
    pub include_initials: bool,
    pub full_groups: bool,
    pub output_csv: bool,
    pub output_xlsx: bool,
    pub output_yaml: bool,
}

impl Default for LmsSettings {
    fn default() -> Self {
        Self {
            r#type: "Canvas".to_string(),
            base_url: "https://canvas.tue.nl".to_string(),
            custom_url: String::new(),
            url_option: LmsUrlOption::TUE,
            access_token: String::new(),
            course_id: String::new(),
            course_name: String::new(),
            yaml_file: "students.yaml".to_string(),
            info_folder: String::new(),
            csv_file: "student-info.csv".to_string(),
            xlsx_file: "student-info.xlsx".to_string(),
            member_option: MemberOption::EmailAndGitId,
            include_group: true,
            include_member: true,
            include_initials: false,
            full_groups: true,
            output_csv: false,
            output_xlsx: false,
            output_yaml: true,
        }
    }
}

impl Normalize for LmsSettings {
    fn normalize(&mut self) {
        normalize_url(&mut self.base_url);
        normalize_url(&mut self.custom_url);
        normalize_string(&mut self.access_token);
        normalize_string(&mut self.course_id);
        normalize_string(&mut self.course_name);
        normalize_string(&mut self.yaml_file);
        normalize_string(&mut self.info_folder);
        normalize_string(&mut self.csv_file);
        normalize_string(&mut self.xlsx_file);
    }
}

/// Repo app settings (Tab 2)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct RepoSettings {
    pub student_repos_group: String,
    pub template_group: String,
    pub yaml_file: String,
    pub target_folder: String,
    pub assignments: String,
    pub directory_layout: DirectoryLayout,
}

impl Default for RepoSettings {
    fn default() -> Self {
        Self {
            student_repos_group: String::new(),
            template_group: String::new(),
            yaml_file: "students.yaml".to_string(),
            target_folder: String::new(),
            assignments: String::new(),
            directory_layout: DirectoryLayout::Flat,
        }
    }
}

impl Normalize for RepoSettings {
    fn normalize(&mut self) {
        normalize_string(&mut self.student_repos_group);
        normalize_string(&mut self.template_group);
        normalize_string(&mut self.yaml_file);
        normalize_string(&mut self.target_folder);
        normalize_string(&mut self.assignments);
    }
}

/// Logging settings (stored in AppSettings)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct LogSettings {
    pub info: bool,
    pub debug: bool,
    pub warning: bool,
    pub error: bool,
}

impl Default for LogSettings {
    fn default() -> Self {
        Self {
            info: true,
            debug: false,
            warning: true,
            error: true,
        }
    }
}

/// Profile settings (nested structure for per-profile data)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct ProfileSettings {
    pub common: CommonSettings,
    pub lms: LmsSettings,
    pub repo: RepoSettings,
}

impl Default for ProfileSettings {
    fn default() -> Self {
        Self {
            common: CommonSettings::default(),
            lms: LmsSettings::default(),
            repo: RepoSettings::default(),
        }
    }
}

impl Normalize for ProfileSettings {
    fn normalize(&mut self) {
        self.common.normalize();
        self.lms.normalize();
        self.repo.normalize();
    }
}
