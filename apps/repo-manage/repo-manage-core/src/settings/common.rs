use super::enums::{DirectoryLayout, LmsUrlOption, MemberOption};
use super::normalization::{normalize_string, normalize_url, Normalize};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// A course entry with ID and optional name (populated after verification)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type, Default, PartialEq)]
pub struct CourseEntry {
    pub id: String,
    pub name: Option<String>,
}

impl Normalize for CourseEntry {
    fn normalize(&mut self) {
        normalize_string(&mut self.id);
        if let Some(ref mut name) = self.name {
            normalize_string(name);
        }
    }
}

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

/// Canvas-specific LMS configuration
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct CanvasConfig {
    pub access_token: String,
    pub base_url: String,
    pub courses: Vec<CourseEntry>,
    pub custom_url: String,
    pub url_option: LmsUrlOption,
}

impl Default for CanvasConfig {
    fn default() -> Self {
        Self {
            access_token: String::new(),
            base_url: "https://canvas.tue.nl".to_string(),
            courses: Vec::new(),
            custom_url: String::new(),
            url_option: LmsUrlOption::TUE,
        }
    }
}

impl Normalize for CanvasConfig {
    fn normalize(&mut self) {
        normalize_string(&mut self.access_token);
        normalize_url(&mut self.base_url);
        for course in &mut self.courses {
            course.normalize();
        }
        normalize_url(&mut self.custom_url);
    }
}

/// Moodle-specific LMS configuration
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct MoodleConfig {
    pub access_token: String,
    pub base_url: String,
    pub courses: Vec<CourseEntry>,
}

impl Normalize for MoodleConfig {
    fn normalize(&mut self) {
        normalize_string(&mut self.access_token);
        normalize_url(&mut self.base_url);
        for course in &mut self.courses {
            course.normalize();
        }
    }
}

/// LMS app settings (Tab 1)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct LmsSettings {
    pub canvas: CanvasConfig,
    pub moodle: MoodleConfig,
    #[serde(rename = "type")]
    pub r#type: String, // "Canvas" or "Moodle"
    // Output settings (shared across LMS types)
    pub csv_file: String,
    pub full_groups: bool,
    pub include_group: bool,
    pub include_initials: bool,
    pub include_member: bool,
    pub member_option: MemberOption,
    pub output_csv: bool,
    pub output_folder: String,
    pub output_xlsx: bool,
    pub output_yaml: bool,
    pub xlsx_file: String,
    pub yaml_file: String,
}

impl Default for LmsSettings {
    fn default() -> Self {
        Self {
            canvas: CanvasConfig::default(),
            moodle: MoodleConfig::default(),
            r#type: "Canvas".to_string(),
            csv_file: "student-info.csv".to_string(),
            full_groups: true,
            include_group: true,
            include_initials: false,
            include_member: true,
            member_option: MemberOption::EmailAndGitId,
            output_csv: false,
            output_folder: String::new(),
            output_xlsx: false,
            output_yaml: true,
            xlsx_file: "student-info.xlsx".to_string(),
            yaml_file: "students.yaml".to_string(),
        }
    }
}

impl Normalize for LmsSettings {
    fn normalize(&mut self) {
        self.canvas.normalize();
        self.moodle.normalize();
        normalize_string(&mut self.csv_file);
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
