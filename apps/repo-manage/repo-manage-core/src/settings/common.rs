use super::enums::{DirectoryLayout, LmsUrlOption, MemberOption};
use super::normalization::{normalize_string, normalize_url, Normalize};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Shared settings used by multiple apps (git credentials)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CommonSettings {
    #[serde(default = "defaults::git_base_url")]
    pub git_base_url: String,

    #[serde(default)]
    pub git_access_token: String,

    #[serde(default)]
    pub git_user: String,
}

impl Default for CommonSettings {
    fn default() -> Self {
        Self {
            git_base_url: defaults::git_base_url(),
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
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct LmsSettings {
    #[serde(default = "defaults::lms_type")]
    pub r#type: String, // "Canvas" or "Moodle"

    #[serde(default = "defaults::lms_base_url")]
    pub base_url: String,

    #[serde(default)]
    pub custom_url: String,

    #[serde(default = "defaults::lms_url_option")]
    pub url_option: LmsUrlOption,

    #[serde(default)]
    pub access_token: String,

    #[serde(default)]
    pub course_id: String,

    #[serde(default)]
    pub course_name: String,

    #[serde(default = "defaults::lms_yaml_file")]
    pub yaml_file: String,

    #[serde(default)]
    pub info_folder: String,

    #[serde(default = "defaults::lms_csv_file")]
    pub csv_file: String,

    #[serde(default = "defaults::lms_xlsx_file")]
    pub xlsx_file: String,

    #[serde(default = "defaults::lms_member_option")]
    pub member_option: MemberOption,

    #[serde(default = "defaults::lms_include_group")]
    pub include_group: bool,

    #[serde(default = "defaults::lms_include_member")]
    pub include_member: bool,

    #[serde(default)]
    pub include_initials: bool,

    #[serde(default = "defaults::lms_full_groups")]
    pub full_groups: bool,

    #[serde(default)]
    pub output_csv: bool,

    #[serde(default)]
    pub output_xlsx: bool,

    #[serde(default = "defaults::lms_output_yaml")]
    pub output_yaml: bool,
}

impl Default for LmsSettings {
    fn default() -> Self {
        Self {
            r#type: defaults::lms_type(),
            base_url: defaults::lms_base_url(),
            custom_url: String::new(),
            url_option: defaults::lms_url_option(),
            access_token: String::new(),
            course_id: String::new(),
            course_name: String::new(),
            yaml_file: defaults::lms_yaml_file(),
            info_folder: String::new(),
            csv_file: defaults::lms_csv_file(),
            xlsx_file: defaults::lms_xlsx_file(),
            member_option: defaults::lms_member_option(),
            include_group: defaults::lms_include_group(),
            include_member: defaults::lms_include_member(),
            include_initials: false,
            full_groups: defaults::lms_full_groups(),
            output_csv: false,
            output_xlsx: false,
            output_yaml: defaults::lms_output_yaml(),
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
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RepoSettings {
    #[serde(default)]
    pub student_repos_group: String,

    #[serde(default)]
    pub template_group: String,

    #[serde(default = "defaults::yaml_file")]
    pub yaml_file: String,

    #[serde(default)]
    pub target_folder: String,

    #[serde(default)]
    pub assignments: String,

    #[serde(default = "defaults::directory_layout")]
    pub directory_layout: DirectoryLayout,
}

impl Default for RepoSettings {
    fn default() -> Self {
        Self {
            student_repos_group: String::new(),
            template_group: String::new(),
            yaml_file: defaults::yaml_file(),
            target_folder: String::new(),
            assignments: String::new(),
            directory_layout: defaults::directory_layout(),
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
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct LogSettings {
    #[serde(default = "defaults::log_info")]
    pub info: bool,

    #[serde(default)]
    pub debug: bool,

    #[serde(default = "defaults::log_warning")]
    pub warning: bool,

    #[serde(default = "defaults::log_error")]
    pub error: bool,
}

impl Default for LogSettings {
    fn default() -> Self {
        Self {
            info: defaults::log_info(),
            debug: false,
            warning: defaults::log_warning(),
            error: defaults::log_error(),
        }
    }
}

/// Profile settings (nested structure for per-profile data)
/// Note: No serde(default) on fields - missing sections cause parse error with warning
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
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
