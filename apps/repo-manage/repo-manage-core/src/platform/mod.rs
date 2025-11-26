//! Platform abstraction layer for GitHub, GitLab, Gitea, and Local (filesystem-based)

use crate::error::Result;
use crate::types::{Issue, IssueState, Repo, Team, TeamPermission};
use std::path::PathBuf;

pub mod gitea;
pub mod github;
pub mod gitlab;
pub mod local;

// Re-export platform implementations
pub use gitea::GiteaAPI;
pub use github::GitHubAPI;
pub use gitlab::GitLabAPI;
pub use local::LocalAPI;

// ============================================================================
// Platform Enum (Enum + Trait Pattern)
// ============================================================================

/// Platform abstraction using enum + trait pattern (not trait objects)
#[derive(Debug)]
pub enum Platform {
    GitHub(GitHubAPI),
    GitLab(GitLabAPI),
    Gitea(GiteaAPI),
    Local(LocalAPI),
}

impl Platform {
    /// Create a new GitHub platform instance
    pub fn github(base_url: String, token: String, org_name: String, user: String) -> Result<Self> {
        Ok(Self::GitHub(GitHubAPI::new(
            base_url, token, org_name, user,
        )?))
    }

    /// Create a new GitLab platform instance
    pub fn gitlab(base_url: String, token: String, org_name: String, user: String) -> Result<Self> {
        Ok(Self::GitLab(GitLabAPI::new(
            base_url, token, org_name, user,
        )?))
    }

    /// Create a new Gitea platform instance
    pub fn gitea(base_url: String, token: String, org_name: String, user: String) -> Result<Self> {
        Ok(Self::Gitea(GiteaAPI::new(base_url, token, org_name, user)?))
    }

    /// Create a new Local (filesystem-based) platform instance
    pub fn local(base_dir: PathBuf, org_name: String, user: String) -> Result<Self> {
        Ok(Self::Local(LocalAPI::new(base_dir, org_name, user)?))
    }
}

// ============================================================================
// PlatformAPI Trait
// ============================================================================

/// Core platform API trait that all platforms must implement
///
/// This trait defines the contract for interacting with different Git hosting platforms.
/// All methods return `Result<T>` to handle platform-specific errors uniformly.
#[allow(async_fn_in_trait)]
pub trait PlatformAPI {
    // ========================================================================
    // Team Management
    // ========================================================================

    /// Create a new team with optional members and permission level
    ///
    /// # Arguments
    /// * `name` - Team name
    /// * `members` - Optional list of member usernames
    /// * `permission` - Permission level for team members
    async fn create_team(
        &self,
        name: &str,
        members: Option<&[String]>,
        permission: TeamPermission,
    ) -> Result<Team>;

    /// Delete a team
    async fn delete_team(&self, team: &Team) -> Result<()>;

    /// Get teams by name. If `team_names` is None, returns all teams in the organization.
    async fn get_teams(&self, team_names: Option<&[String]>) -> Result<Vec<Team>>;

    /// Assign a repository to a team with the specified permission level
    async fn assign_repo(&self, team: &Team, repo: &Repo, permission: TeamPermission)
        -> Result<()>;

    /// Add members to a team with the specified permission level
    async fn assign_members(
        &self,
        team: &Team,
        members: &[String],
        permission: TeamPermission,
    ) -> Result<()>;

    // ========================================================================
    // Repository Management
    // ========================================================================

    /// Create a new repository
    ///
    /// Note: If the repository already exists, this should return the existing repository
    /// without raising an error (matching Python RepoBee behavior)
    ///
    /// # Arguments
    /// * `name` - Repository name
    /// * `description` - Repository description
    /// * `private` - Whether the repository should be private
    /// * `team` - Optional team to assign the repository to
    async fn create_repo(
        &self,
        name: &str,
        description: &str,
        private: bool,
        team: Option<&Team>,
    ) -> Result<Repo>;

    /// Delete a repository
    async fn delete_repo(&self, repo: &Repo) -> Result<()>;

    /// Get repositories by URL. If `repo_urls` is None, returns all repos in the organization.
    async fn get_repos(&self, repo_urls: Option<&[String]>) -> Result<Vec<Repo>>;

    /// Get a specific repository by name
    ///
    /// # Arguments
    /// * `repo_name` - Repository name
    /// * `team_name` - Optional team name (used by some platforms for namespacing)
    async fn get_repo(&self, repo_name: &str, team_name: Option<&str>) -> Result<Repo>;

    /// Get all repositories assigned to a team
    async fn get_team_repos(&self, team: &Team) -> Result<Vec<Repo>>;

    /// Generate repository URLs for the given assignment names and teams
    ///
    /// # Arguments
    /// * `assignment_names` - List of assignment/template names
    /// * `org_name` - Optional organization name (uses default if None)
    /// * `team_names` - Optional list of team names
    /// * `insert_auth` - Whether to insert authentication token into URLs
    fn get_repo_urls(
        &self,
        assignment_names: &[String],
        org_name: Option<&str>,
        team_names: Option<&[String]>,
        insert_auth: bool,
    ) -> Result<Vec<String>>;

    // ========================================================================
    // Issue Management
    // ========================================================================

    /// Create a new issue in a repository
    ///
    /// # Arguments
    /// * `title` - Issue title
    /// * `body` - Issue body/description
    /// * `repo` - Target repository
    /// * `assignees` - Optional list of usernames to assign the issue to
    async fn create_issue(
        &self,
        title: &str,
        body: &str,
        repo: &Repo,
        assignees: Option<&[String]>,
    ) -> Result<Issue>;

    /// Close an issue
    async fn close_issue(&self, issue: &Issue, repo: &Repo) -> Result<()>;

    /// Get all issues from a repository
    async fn get_repo_issues(&self, repo: &Repo, state: IssueState) -> Result<Vec<Issue>>;

    // ========================================================================
    // URL & Authentication
    // ========================================================================

    /// Insert authentication token into a repository URL
    fn insert_auth(&self, url: &str) -> Result<String>;

    /// Extract repository name from a platform-specific URL
    fn extract_repo_name(&self, repo_url: &str) -> Result<String>;

    // ========================================================================
    // Organization Management
    // ========================================================================

    /// Create a new instance of this API targeting a different organization
    fn for_organization(&self, org_name: &str) -> Result<Self>
    where
        Self: Sized;

    // ========================================================================
    // Configuration & Verification
    // ========================================================================

    /// Verify that the configuration and credentials are valid
    async fn verify_settings(&self) -> Result<()>;

    /// Get the current organization name
    fn org_name(&self) -> &str;

    /// Get the current user
    fn user(&self) -> &str;

    /// Get the base URL
    fn base_url(&self) -> &str;
}

// ============================================================================
// Implement PlatformAPI for Platform enum (delegates to concrete types)
// ============================================================================

impl PlatformAPI for Platform {
    async fn create_team(
        &self,
        name: &str,
        members: Option<&[String]>,
        permission: TeamPermission,
    ) -> Result<Team> {
        match self {
            Platform::GitHub(api) => api.create_team(name, members, permission).await,
            Platform::GitLab(api) => api.create_team(name, members, permission).await,
            Platform::Gitea(api) => api.create_team(name, members, permission).await,

            Platform::Local(api) => api.create_team(name, members, permission).await,
        }
    }

    async fn delete_team(&self, team: &Team) -> Result<()> {
        match self {
            Platform::GitHub(api) => api.delete_team(team).await,
            Platform::GitLab(api) => api.delete_team(team).await,
            Platform::Gitea(api) => api.delete_team(team).await,

            Platform::Local(api) => api.delete_team(team).await,
        }
    }

    async fn get_teams(&self, team_names: Option<&[String]>) -> Result<Vec<Team>> {
        match self {
            Platform::GitHub(api) => api.get_teams(team_names).await,
            Platform::GitLab(api) => api.get_teams(team_names).await,
            Platform::Gitea(api) => api.get_teams(team_names).await,

            Platform::Local(api) => api.get_teams(team_names).await,
        }
    }

    async fn assign_repo(
        &self,
        team: &Team,
        repo: &Repo,
        permission: TeamPermission,
    ) -> Result<()> {
        match self {
            Platform::GitHub(api) => api.assign_repo(team, repo, permission).await,
            Platform::GitLab(api) => api.assign_repo(team, repo, permission).await,
            Platform::Gitea(api) => api.assign_repo(team, repo, permission).await,

            Platform::Local(api) => api.assign_repo(team, repo, permission).await,
        }
    }

    async fn assign_members(
        &self,
        team: &Team,
        members: &[String],
        permission: TeamPermission,
    ) -> Result<()> {
        match self {
            Platform::GitHub(api) => api.assign_members(team, members, permission).await,
            Platform::GitLab(api) => api.assign_members(team, members, permission).await,
            Platform::Gitea(api) => api.assign_members(team, members, permission).await,

            Platform::Local(api) => api.assign_members(team, members, permission).await,
        }
    }

    async fn create_repo(
        &self,
        name: &str,
        description: &str,
        private: bool,
        team: Option<&Team>,
    ) -> Result<Repo> {
        match self {
            Platform::GitHub(api) => api.create_repo(name, description, private, team).await,
            Platform::GitLab(api) => api.create_repo(name, description, private, team).await,
            Platform::Gitea(api) => api.create_repo(name, description, private, team).await,

            Platform::Local(api) => api.create_repo(name, description, private, team).await,
        }
    }

    async fn delete_repo(&self, repo: &Repo) -> Result<()> {
        match self {
            Platform::GitHub(api) => api.delete_repo(repo).await,
            Platform::GitLab(api) => api.delete_repo(repo).await,
            Platform::Gitea(api) => api.delete_repo(repo).await,

            Platform::Local(api) => api.delete_repo(repo).await,
        }
    }

    async fn get_repos(&self, repo_urls: Option<&[String]>) -> Result<Vec<Repo>> {
        match self {
            Platform::GitHub(api) => api.get_repos(repo_urls).await,
            Platform::GitLab(api) => api.get_repos(repo_urls).await,
            Platform::Gitea(api) => api.get_repos(repo_urls).await,

            Platform::Local(api) => api.get_repos(repo_urls).await,
        }
    }

    async fn get_repo(&self, repo_name: &str, team_name: Option<&str>) -> Result<Repo> {
        match self {
            Platform::GitHub(api) => api.get_repo(repo_name, team_name).await,
            Platform::GitLab(api) => api.get_repo(repo_name, team_name).await,
            Platform::Gitea(api) => api.get_repo(repo_name, team_name).await,

            Platform::Local(api) => api.get_repo(repo_name, team_name).await,
        }
    }

    async fn get_team_repos(&self, team: &Team) -> Result<Vec<Repo>> {
        match self {
            Platform::GitHub(api) => api.get_team_repos(team).await,
            Platform::GitLab(api) => api.get_team_repos(team).await,
            Platform::Gitea(api) => api.get_team_repos(team).await,

            Platform::Local(api) => api.get_team_repos(team).await,
        }
    }

    fn get_repo_urls(
        &self,
        assignment_names: &[String],
        org_name: Option<&str>,
        team_names: Option<&[String]>,
        insert_auth: bool,
    ) -> Result<Vec<String>> {
        match self {
            Platform::GitHub(api) => {
                api.get_repo_urls(assignment_names, org_name, team_names, insert_auth)
            }
            Platform::GitLab(api) => {
                api.get_repo_urls(assignment_names, org_name, team_names, insert_auth)
            }
            Platform::Gitea(api) => {
                api.get_repo_urls(assignment_names, org_name, team_names, insert_auth)
            }

            Platform::Local(api) => {
                api.get_repo_urls(assignment_names, org_name, team_names, insert_auth)
            }
        }
    }

    async fn create_issue(
        &self,
        title: &str,
        body: &str,
        repo: &Repo,
        assignees: Option<&[String]>,
    ) -> Result<Issue> {
        match self {
            Platform::GitHub(api) => api.create_issue(title, body, repo, assignees).await,
            Platform::GitLab(api) => api.create_issue(title, body, repo, assignees).await,
            Platform::Gitea(api) => api.create_issue(title, body, repo, assignees).await,

            Platform::Local(api) => api.create_issue(title, body, repo, assignees).await,
        }
    }

    async fn close_issue(&self, issue: &Issue, repo: &Repo) -> Result<()> {
        match self {
            Platform::GitHub(api) => api.close_issue(issue, repo).await,
            Platform::GitLab(api) => api.close_issue(issue, repo).await,
            Platform::Gitea(api) => api.close_issue(issue, repo).await,

            Platform::Local(api) => api.close_issue(issue, repo).await,
        }
    }

    async fn get_repo_issues(&self, repo: &Repo, state: IssueState) -> Result<Vec<Issue>> {
        match self {
            Platform::GitHub(api) => api.get_repo_issues(repo, state).await,
            Platform::GitLab(api) => api.get_repo_issues(repo, state).await,
            Platform::Gitea(api) => api.get_repo_issues(repo, state).await,

            Platform::Local(api) => api.get_repo_issues(repo, state).await,
        }
    }

    fn insert_auth(&self, url: &str) -> Result<String> {
        match self {
            Platform::GitHub(api) => api.insert_auth(url),
            Platform::GitLab(api) => api.insert_auth(url),
            Platform::Gitea(api) => api.insert_auth(url),

            Platform::Local(api) => api.insert_auth(url),
        }
    }

    fn extract_repo_name(&self, repo_url: &str) -> Result<String> {
        match self {
            Platform::GitHub(api) => api.extract_repo_name(repo_url),
            Platform::GitLab(api) => api.extract_repo_name(repo_url),
            Platform::Gitea(api) => api.extract_repo_name(repo_url),

            Platform::Local(api) => api.extract_repo_name(repo_url),
        }
    }

    fn for_organization(&self, org_name: &str) -> Result<Self> {
        match self {
            Platform::GitHub(api) => Ok(Platform::GitHub(api.for_organization(org_name)?)),
            Platform::GitLab(api) => Ok(Platform::GitLab(api.for_organization(org_name)?)),
            Platform::Gitea(api) => Ok(Platform::Gitea(api.for_organization(org_name)?)),
            Platform::Local(api) => Ok(Platform::Local(api.for_organization(org_name)?)),
        }
    }

    async fn verify_settings(&self) -> Result<()> {
        match self {
            Platform::GitHub(api) => api.verify_settings().await,
            Platform::GitLab(api) => api.verify_settings().await,
            Platform::Gitea(api) => api.verify_settings().await,

            Platform::Local(api) => api.verify_settings().await,
        }
    }

    fn org_name(&self) -> &str {
        match self {
            Platform::GitHub(api) => api.org_name(),
            Platform::GitLab(api) => api.org_name(),
            Platform::Gitea(api) => api.org_name(),

            Platform::Local(api) => api.org_name(),
        }
    }

    fn user(&self) -> &str {
        match self {
            Platform::GitHub(api) => api.user(),
            Platform::GitLab(api) => api.user(),
            Platform::Gitea(api) => api.user(),

            Platform::Local(api) => api.user(),
        }
    }

    fn base_url(&self) -> &str {
        match self {
            Platform::GitHub(api) => api.base_url(),
            Platform::GitLab(api) => api.base_url(),
            Platform::Gitea(api) => api.base_url(),

            Platform::Local(api) => api.base_url(),
        }
    }
}
