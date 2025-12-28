#![allow(clippy::derivable_impls)]

use super::normalization::{normalize_string, normalize_url, Normalize};
use super::{DirectoryLayout, GitServerType, LmsUrlOption, MemberOption};
use crate::generated::types::{
    CanvasConfig, CourseEntry, GitHubConfig, GitLabConfig, GitSettings, GiteaConfig, LmsSettings,
    LogSettings, MoodleConfig, ProfileSettings, RepoSettings,
};

impl Default for CourseEntry {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: None,
        }
    }
}

impl Normalize for CourseEntry {
    fn normalize(&mut self) {
        normalize_string(&mut self.id);
        if let Some(ref mut name) = self.name {
            normalize_string(name);
        }
    }
}

impl Default for GitHubConfig {
    fn default() -> Self {
        Self {
            access_token: String::new(),
            user: String::new(),
            student_repos_org: String::new(),
            template_org: String::new(),
        }
    }
}

impl Normalize for GitHubConfig {
    fn normalize(&mut self) {
        normalize_string(&mut self.access_token);
        normalize_string(&mut self.user);
        normalize_string(&mut self.student_repos_org);
        normalize_string(&mut self.template_org);
    }
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

impl Default for GiteaConfig {
    fn default() -> Self {
        Self {
            access_token: String::new(),
            base_url: String::new(),
            user: String::new(),
            student_repos_group: String::new(),
            template_group: String::new(),
        }
    }
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

impl Default for GitSettings {
    fn default() -> Self {
        Self {
            gitea: GiteaConfig::default(),
            github: GitHubConfig::default(),
            gitlab: GitLabConfig::default(),
            server_type: GitServerType::default(),
        }
    }
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

impl Default for MoodleConfig {
    fn default() -> Self {
        Self {
            access_token: String::new(),
            base_url: String::new(),
            courses: Vec::new(),
        }
    }
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

impl Default for LmsSettings {
    fn default() -> Self {
        Self {
            canvas: CanvasConfig::default(),
            moodle: MoodleConfig::default(),
            r#type: "Canvas".to_string(),
            active_course_index: 0,
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

impl Default for ProfileSettings {
    fn default() -> Self {
        Self {
            git: GitSettings::default(),
            lms: LmsSettings::default(),
            repo: RepoSettings::default(),
        }
    }
}

impl Normalize for ProfileSettings {
    fn normalize(&mut self) {
        self.git.normalize();
        self.lms.normalize();
        self.repo.normalize();
    }
}
