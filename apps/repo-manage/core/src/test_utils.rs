//! Test utilities for repo-manage-core
//!
//! Provides reusable test helpers for mocking platform APIs,
//! creating fixtures, and common assertions. Only compiled in test builds.

use crate::platform::PlatformParams;
use crate::types::{Repo, StudentTeam, Team};
use git2::Repository;
use std::fs;
use std::path::Path;

// ============================================================================
// Fixture Builders
// ============================================================================

/// Builder for creating test StudentTeam instances
pub struct StudentTeamBuilder {
    members: Vec<String>,
    name: Option<String>,
}

impl StudentTeamBuilder {
    pub fn new() -> Self {
        Self {
            members: vec!["student1".to_string()],
            name: None,
        }
    }

    pub fn with_members(mut self, members: Vec<&str>) -> Self {
        self.members = members.into_iter().map(String::from).collect();
        self
    }

    pub fn with_name(mut self, name: &str) -> Self {
        self.name = Some(name.to_string());
        self
    }

    pub fn build(self) -> StudentTeam {
        match self.name {
            Some(name) => StudentTeam::with_name(name, self.members),
            None => StudentTeam::new(self.members),
        }
    }
}

impl Default for StudentTeamBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Builder for creating test Team instances (platform teams)
pub struct TeamBuilder {
    name: String,
    members: Vec<String>,
    id: String,
}

impl TeamBuilder {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            members: Vec::new(),
            id: "1".to_string(),
        }
    }

    pub fn with_members(mut self, members: Vec<&str>) -> Self {
        self.members = members.into_iter().map(String::from).collect();
        self
    }

    pub fn with_id(mut self, id: &str) -> Self {
        self.id = id.to_string();
        self
    }

    pub fn build(self) -> Team {
        Team::new(self.name, self.members, self.id)
    }
}

/// Builder for creating test Repo instances
pub struct RepoBuilder {
    name: String,
    description: String,
    private: bool,
    url: String,
}

impl RepoBuilder {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            description: String::new(),
            private: true,
            url: format!("https://example.com/org/{}.git", name),
        }
    }

    pub fn with_url(mut self, url: &str) -> Self {
        self.url = url.to_string();
        self
    }

    pub fn public(mut self) -> Self {
        self.private = false;
        self
    }

    pub fn build(self) -> Repo {
        Repo::new(self.name, self.description, self.private, self.url)
    }
}

/// Builder for PlatformParams
pub struct PlatformParamsBuilder {
    base_url: String,
    access_token: String,
    organization: String,
    user: String,
}

impl PlatformParamsBuilder {
    pub fn new() -> Self {
        Self {
            base_url: "https://gitlab.example.com".to_string(),
            access_token: "test-token".to_string(),
            organization: "test-org".to_string(),
            user: "test-user".to_string(),
        }
    }

    /// Set base_url to a mockito server URL
    pub fn with_mock_server(mut self, server_url: &str) -> Self {
        self.base_url = server_url.to_string();
        self
    }

    pub fn with_org(mut self, org: &str) -> Self {
        self.organization = org.to_string();
        self
    }

    pub fn with_token(mut self, token: &str) -> Self {
        self.access_token = token.to_string();
        self
    }

    pub fn build(self) -> PlatformParams {
        PlatformParams {
            base_url: self.base_url,
            access_token: self.access_token,
            organization: self.organization,
            user: self.user,
        }
    }
}

impl Default for PlatformParamsBuilder {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Mock Response Helpers
// ============================================================================

/// Common GitLab API response JSON builders
pub mod gitlab_responses {
    pub fn user(username: &str) -> String {
        format!(r#"{{"id":1,"username":"{}"}}"#, username)
    }

    pub fn group(id: u64, name: &str, path: &str) -> String {
        format!(
            r#"{{"id":{},"name":"{}","path":"{}","full_path":"{}"}}"#,
            id, name, path, path
        )
    }

    pub fn project(id: u64, path: &str, base_url: &str, org: &str) -> String {
        format!(
            r#"{{"id":{},"path":"{}","description":"","visibility":"private","http_url_to_repo":"{}/{}/{}.git"}}"#,
            id, path, base_url, org, path
        )
    }

    pub fn members(usernames: &[&str]) -> String {
        let members: Vec<String> = usernames
            .iter()
            .map(|u| format!(r#"{{"username":"{}","access_level":30}}"#, u))
            .collect();
        format!("[{}]", members.join(","))
    }

    pub fn empty_array() -> &'static str {
        "[]"
    }
}

/// Common GitHub API response JSON builders
pub mod github_responses {
    pub fn user(login: &str) -> String {
        format!(r#"{{"login":"{}","id":1}}"#, login)
    }

    pub fn org(login: &str) -> String {
        format!(r#"{{"login":"{}","id":1}}"#, login)
    }

    pub fn repo(name: &str, org: &str, base_url: &str) -> String {
        format!(
            r#"{{"name":"{}","description":"","private":true,"html_url":"{}/{}/{}"}}"#,
            name, base_url, org, name
        )
    }

    pub fn team(id: u64, name: &str, slug: &str) -> String {
        format!(r#"{{"id":{},"name":"{}","slug":"{}"}}"#, id, name, slug)
    }

    pub fn teams(teams: &[(&str, &str)]) -> String {
        let items: Vec<String> = teams
            .iter()
            .enumerate()
            .map(|(i, (name, slug))| {
                format!(r#"{{"id":{},"name":"{}","slug":"{}"}}"#, i + 1, name, slug)
            })
            .collect();
        format!("[{}]", items.join(","))
    }

    pub fn members(logins: &[&str]) -> String {
        let items: Vec<String> = logins
            .iter()
            .map(|login| format!(r#"{{"login":"{}"}}"#, login))
            .collect();
        format!("[{}]", items.join(","))
    }

    pub fn repos(repos: &[(&str, &str, &str)]) -> String {
        let items: Vec<String> = repos
            .iter()
            .map(|(name, org, base_url)| {
                format!(
                    r#"{{"name":"{}","description":"","private":true,"html_url":"{}/{}/{}"}}"#,
                    name, base_url, org, name
                )
            })
            .collect();
        format!("[{}]", items.join(","))
    }
}

/// Common Gitea API response JSON builders
pub mod gitea_responses {
    pub fn user(login: &str) -> String {
        format!(r#"{{"login":"{}","id":1}}"#, login)
    }

    pub fn org(name: &str) -> String {
        format!(r#"{{"username":"{}","id":1}}"#, name)
    }

    pub fn version() -> &'static str {
        r#"{"version":"1.21.0"}"#
    }

    pub fn repo(name: &str, org: &str, base_url: &str) -> String {
        format!(
            r#"{{"name":"{}","description":"","private":true,"clone_url":"{}/{}/{}.git","owner":{{"login":"{}","id":1}}}}"#,
            name, base_url, org, name, org
        )
    }

    pub fn repos(repos: &[(&str, &str, &str)]) -> String {
        let items: Vec<String> = repos
            .iter()
            .map(|(name, org, base_url)| {
                format!(
                    r#"{{"name":"{}","description":"","private":true,"clone_url":"{}/{}/{}.git","owner":{{"login":"{}","id":1}}}}"#,
                    name, base_url, org, name, org
                )
            })
            .collect();
        format!("[{}]", items.join(","))
    }

    pub fn team(id: u64, name: &str) -> String {
        format!(r#"{{"id":{},"name":"{}"}}"#, id, name)
    }
}

// ============================================================================
// Git Test Helpers
// ============================================================================

/// Create a minimal git repository with one commit
pub fn create_test_git_repo(path: &Path) -> Repository {
    let repo = Repository::init(path).expect("Failed to init repo");

    {
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test").unwrap();
        config.set_str("user.email", "test@test.com").unwrap();
    }

    let readme = path.join("README.md");
    fs::write(&readme, "# Test\n").unwrap();

    {
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("README.md")).unwrap();
        index.write().unwrap();

        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = repo.signature().unwrap();

        repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
            .unwrap();
    }

    repo
}

/// Create a bare git repository (for testing push operations)
pub fn create_bare_repo(path: &Path) -> Repository {
    Repository::init_bare(path).expect("Failed to init bare repo")
}
