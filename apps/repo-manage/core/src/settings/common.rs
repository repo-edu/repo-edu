#![allow(clippy::derivable_impls)]

use std::collections::HashMap;

use super::normalization::{normalize_string, normalize_url, Normalize};
use super::{DirectoryLayout, GitIdentityMode, GitServerType, MemberOption, Theme};
use crate::generated::types::{
    AppSettings, CloneConfig, CourseInfo, CreateConfig, DeleteConfig, ExportSettings,
    GitConnection, LmsConnection, OperationConfigs, PlatformConnection, ProfileSettings,
};
use crate::generated::types::{DateFormat, TimeFormat};

impl Default for CourseInfo {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
        }
    }
}

impl Normalize for CourseInfo {
    fn normalize(&mut self) {
        normalize_string(&mut self.id);
        normalize_string(&mut self.name);
    }
}

impl Default for PlatformConnection {
    fn default() -> Self {
        Self {
            access_token: String::new(),
            base_url: None,
            user: String::new(),
        }
    }
}

impl Normalize for PlatformConnection {
    fn normalize(&mut self) {
        normalize_string(&mut self.access_token);
        if let Some(ref mut base_url) = self.base_url {
            normalize_url(base_url);
        }
        normalize_string(&mut self.user);
    }
}

impl Default for GitConnection {
    fn default() -> Self {
        Self {
            server_type: GitServerType::default(),
            connection: PlatformConnection::default(),
            identity_mode: None,
        }
    }
}

impl Normalize for GitConnection {
    fn normalize(&mut self) {
        self.connection.normalize();
        match self.server_type {
            GitServerType::GitLab => {
                if self.identity_mode.is_none() {
                    self.identity_mode = Some(GitIdentityMode::default());
                }
            }
            _ => {
                self.identity_mode = None;
            }
        }
    }
}

impl Normalize for LmsConnection {
    fn normalize(&mut self) {
        normalize_url(&mut self.base_url);
        normalize_string(&mut self.access_token);
        if let Some(ref mut user_agent) = self.user_agent {
            normalize_string(user_agent);
            if user_agent.is_empty() {
                self.user_agent = None;
            }
        }
    }
}

impl Default for CreateConfig {
    fn default() -> Self {
        Self {
            template_org: String::new(),
        }
    }
}

impl Normalize for CreateConfig {
    fn normalize(&mut self) {
        normalize_string(&mut self.template_org);
    }
}

impl Default for CloneConfig {
    fn default() -> Self {
        Self {
            target_dir: String::new(),
            directory_layout: DirectoryLayout::default(),
        }
    }
}

impl Normalize for CloneConfig {
    fn normalize(&mut self) {
        normalize_string(&mut self.target_dir);
    }
}

impl Default for DeleteConfig {
    fn default() -> Self {
        Self {}
    }
}

impl Normalize for DeleteConfig {
    fn normalize(&mut self) {}
}

impl Default for OperationConfigs {
    fn default() -> Self {
        Self {
            target_org: String::new(),
            repo_name_template: String::new(),
            create: CreateConfig::default(),
            clone: CloneConfig::default(),
            delete: DeleteConfig::default(),
        }
    }
}

impl Normalize for OperationConfigs {
    fn normalize(&mut self) {
        normalize_string(&mut self.target_org);
        normalize_string(&mut self.repo_name_template);
        self.create.normalize();
        self.clone.normalize();
        self.delete.normalize();
    }
}

impl Default for ExportSettings {
    fn default() -> Self {
        Self {
            output_folder: String::new(),
            output_csv: false,
            output_xlsx: false,
            output_yaml: false,
            csv_file: String::new(),
            xlsx_file: String::new(),
            yaml_file: String::new(),
            member_option: MemberOption::default(),
            include_group: false,
            include_member: false,
            include_initials: false,
            full_groups: false,
        }
    }
}

impl Normalize for ExportSettings {
    fn normalize(&mut self) {
        normalize_string(&mut self.output_folder);
        normalize_string(&mut self.csv_file);
        normalize_string(&mut self.xlsx_file);
        normalize_string(&mut self.yaml_file);
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Theme::default(),
            date_format: DateFormat::default(),
            time_format: TimeFormat::default(),
            lms_connection: None,
            git_connections: HashMap::new(),
        }
    }
}

impl Normalize for AppSettings {
    fn normalize(&mut self) {
        if let Some(ref mut lms_connection) = self.lms_connection {
            lms_connection.normalize();
        }
        for connection in self.git_connections.values_mut() {
            connection.normalize();
        }
    }
}

impl Default for ProfileSettings {
    fn default() -> Self {
        Self {
            course: CourseInfo::default(),
            git_connection: None,
            operations: OperationConfigs::default(),
            exports: ExportSettings::default(),
        }
    }
}

impl Normalize for ProfileSettings {
    fn normalize(&mut self) {
        self.course.normalize();
        if let Some(ref mut git_connection) = self.git_connection {
            normalize_string(git_connection);
        }
        self.operations.normalize();
        self.exports.normalize();
    }
}
