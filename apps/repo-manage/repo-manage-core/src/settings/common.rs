use super::enums::{DirectoryLayout, GitServerType, LmsUrlOption, MemberOption};
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

/// GitHub-specific configuration (no base_url - always github.com)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type, Default)]
pub struct GitHubConfig {
    pub access_token: String,
    pub user: String,
    pub student_repos_org: String,
    pub template_org: String,
}

impl Normalize for GitHubConfig {
    fn normalize(&mut self) {
        normalize_string(&mut self.access_token);
        normalize_string(&mut self.user);
        normalize_string(&mut self.student_repos_org);
        normalize_string(&mut self.template_org);
    }
}

/// GitLab-specific configuration (requires base_url)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct GitLabConfig {
    pub access_token: String,
    pub base_url: String,
    pub user: String,
    pub student_repos_group: String,
    pub template_group: String,
}

impl Default for GitLabConfig {
    fn default() -> Self {
        Self {
            access_token: String::new(),
            base_url: "https://gitlab.tue.nl".to_string(),
            user: String::new(),
            student_repos_group: String::new(),
            template_group: String::new(),
        }
    }
}

impl Normalize for GitLabConfig {
    fn normalize(&mut self) {
        normalize_string(&mut self.access_token);
        normalize_url(&mut self.base_url);
        normalize_string(&mut self.user);
        normalize_string(&mut self.student_repos_group);
        normalize_string(&mut self.template_group);
    }
}

/// Gitea-specific configuration (requires base_url)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type, Default)]
pub struct GiteaConfig {
    pub access_token: String,
    pub base_url: String,
    pub user: String,
    pub student_repos_group: String,
    pub template_group: String,
}

impl Normalize for GiteaConfig {
    fn normalize(&mut self) {
        normalize_string(&mut self.access_token);
        normalize_url(&mut self.base_url);
        normalize_string(&mut self.user);
        normalize_string(&mut self.student_repos_group);
        normalize_string(&mut self.template_group);
    }
}

/// Git server settings (shared across apps)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type, Default)]
pub struct GitSettings {
    pub gitea: GiteaConfig,
    pub github: GitHubConfig,
    pub gitlab: GitLabConfig,
    #[serde(rename = "type")]
    pub server_type: GitServerType,
}

impl GitSettings {
    /// Get the access token for the active server
    pub fn access_token(&self) -> &str {
        match self.server_type {
            GitServerType::GitHub => &self.github.access_token,
            GitServerType::GitLab => &self.gitlab.access_token,
            GitServerType::Gitea => &self.gitea.access_token,
        }
    }

    /// Get the base URL for the active server (GitHub returns "https://github.com")
    pub fn base_url(&self) -> &str {
        match self.server_type {
            GitServerType::GitHub => "https://github.com",
            GitServerType::GitLab => &self.gitlab.base_url,
            GitServerType::Gitea => &self.gitea.base_url,
        }
    }

    /// Get the user for the active server
    pub fn user(&self) -> &str {
        match self.server_type {
            GitServerType::GitHub => &self.github.user,
            GitServerType::GitLab => &self.gitlab.user,
            GitServerType::Gitea => &self.gitea.user,
        }
    }

    /// Get the student repos org/group for the active server
    pub fn student_repos(&self) -> &str {
        match self.server_type {
            GitServerType::GitHub => &self.github.student_repos_org,
            GitServerType::GitLab => &self.gitlab.student_repos_group,
            GitServerType::Gitea => &self.gitea.student_repos_group,
        }
    }

    /// Get the template org/group for the active server
    pub fn template(&self) -> &str {
        match self.server_type {
            GitServerType::GitHub => &self.github.template_org,
            GitServerType::GitLab => &self.gitlab.template_group,
            GitServerType::Gitea => &self.gitea.template_group,
        }
    }
}

impl Normalize for GitSettings {
    fn normalize(&mut self) {
        self.gitea.normalize();
        self.github.normalize();
        self.gitlab.normalize();
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
    pub target_folder: String,
    pub yaml_file: String,
}

impl Default for RepoSettings {
    fn default() -> Self {
        Self {
            assignments: String::new(),
            directory_layout: DirectoryLayout::Flat,
            target_folder: String::new(),
            yaml_file: "students.yaml".to_string(),
        }
    }
}

impl Normalize for RepoSettings {
    fn normalize(&mut self) {
        normalize_string(&mut self.assignments);
        normalize_string(&mut self.target_folder);
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
    pub git: GitSettings,
    pub lms: LmsSettings,
    pub repo: RepoSettings,
}

impl Normalize for ProfileSettings {
    fn normalize(&mut self) {
        self.git.normalize();
        self.lms.normalize();
        self.repo.normalize();
    }
}
