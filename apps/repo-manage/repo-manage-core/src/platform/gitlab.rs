//! GitLab platform implementation

use crate::error::{PlatformError, Result};
use crate::platform::PlatformAPI;
use crate::types::{Issue, IssueState, Repo, Team, TeamPermission};

/// GitLab API client
#[derive(Debug)]
pub struct GitLabAPI {
    base_url: String,
    token: String,
    org_name: String,
    user: String,
    client: reqwest::Client,
}

impl GitLabAPI {
    /// Create a new GitLab API client
    pub fn new(base_url: String, token: String, org_name: String, user: String) -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent("repobee-rust/0.1.0")
            .build()?;

        Ok(Self {
            base_url,
            token,
            org_name,
            user,
            client,
        })
    }
}

impl PlatformAPI for GitLabAPI {
    async fn create_team(
        &self,
        _name: &str,
        _members: Option<&[String]>,
        _permission: TeamPermission,
    ) -> Result<Team> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    async fn delete_team(&self, _team: &Team) -> Result<()> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    async fn get_teams(&self, _team_names: Option<&[String]>) -> Result<Vec<Team>> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    async fn assign_repo(
        &self,
        _team: &Team,
        _repo: &Repo,
        _permission: TeamPermission,
    ) -> Result<()> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    async fn assign_members(
        &self,
        _team: &Team,
        _members: &[String],
        _permission: TeamPermission,
    ) -> Result<()> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    async fn create_repo(
        &self,
        _name: &str,
        _description: &str,
        _private: bool,
        _team: Option<&Team>,
    ) -> Result<Repo> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    async fn delete_repo(&self, _repo: &Repo) -> Result<()> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    async fn get_repos(&self, _repo_urls: Option<&[String]>) -> Result<Vec<Repo>> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    async fn get_repo(&self, _repo_name: &str, _team_name: Option<&str>) -> Result<Repo> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    async fn get_team_repos(&self, _team: &Team) -> Result<Vec<Repo>> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    fn get_repo_urls(
        &self,
        _assignment_names: &[String],
        _org_name: Option<&str>,
        _team_names: Option<&[String]>,
        _insert_auth: bool,
    ) -> Result<Vec<String>> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    async fn create_issue(
        &self,
        _title: &str,
        _body: &str,
        _repo: &Repo,
        _assignees: Option<&[String]>,
    ) -> Result<Issue> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    async fn close_issue(&self, _issue: &Issue, _repo: &Repo) -> Result<()> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    async fn get_repo_issues(&self, _repo: &Repo, _state: IssueState) -> Result<Vec<Issue>> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    fn insert_auth(&self, _url: &str) -> Result<String> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    fn extract_repo_name(&self, _repo_url: &str) -> Result<String> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    fn for_organization(&self, org_name: &str) -> Result<Self> {
        Ok(Self {
            base_url: self.base_url.clone(),
            token: self.token.clone(),
            org_name: org_name.to_string(),
            user: self.user.clone(),
            client: self.client.clone(),
        })
    }

    async fn verify_settings(&self) -> Result<()> {
        Err(PlatformError::Other(
            "GitLab implementation not yet implemented".to_string(),
        ))
    }

    fn org_name(&self) -> &str {
        &self.org_name
    }

    fn user(&self) -> &str {
        &self.user
    }

    fn base_url(&self) -> &str {
        &self.base_url
    }
}
