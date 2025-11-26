//! Local filesystem-based platform implementation for testing
//!
//! LocalAPI provides a filesystem-based implementation of the PlatformAPI trait
//! that stores data as JSON files. This is useful for testing without making real API calls.
//!
//! # Storage Structure
//!
//! ```text
//! base_dir/
//! └── orgs/
//!     └── {org_name}/
//!         ├── teams/
//!         │   └── {team_name}.json
//!         ├── repos/
//!         │   └── {repo_name}.json
//!         └── issues/
//!             └── {repo_name}/
//!                 └── {issue_number}.json
//! ```

use crate::error::{PlatformError, Result};
use crate::platform::PlatformAPI;
use crate::types::{Issue, IssueState, Repo, Team, TeamPermission};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Local filesystem-based API client
#[derive(Debug, Clone)]
pub struct LocalAPI {
    base_dir: PathBuf,
    org_name: String,
    user: String,
    base_url: String,
}

/// Stored issue data with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredIssue {
    issue: Issue,
    repo_name: String,
}

impl LocalAPI {
    /// Create a new LocalAPI instance
    ///
    /// # Arguments
    /// * `base_dir` - Base directory for storing data
    /// * `org_name` - Organization name
    /// * `user` - Current user
    pub fn new(base_dir: PathBuf, org_name: String, user: String) -> Result<Self> {
        let base_url = format!("file://{}", base_dir.display());

        // Create directory structure
        let org_dir = base_dir.join("orgs").join(&org_name);
        fs::create_dir_all(org_dir.join("teams"))
            .map_err(|e| PlatformError::FileError(format!("Failed to create teams dir: {}", e)))?;
        fs::create_dir_all(org_dir.join("repos"))
            .map_err(|e| PlatformError::FileError(format!("Failed to create repos dir: {}", e)))?;
        fs::create_dir_all(org_dir.join("issues"))
            .map_err(|e| PlatformError::FileError(format!("Failed to create issues dir: {}", e)))?;

        Ok(Self {
            base_dir,
            org_name,
            user,
            base_url,
        })
    }

    /// Get the organization directory
    fn org_dir(&self) -> PathBuf {
        self.base_dir.join("orgs").join(&self.org_name)
    }

    /// Get the teams directory
    fn teams_dir(&self) -> PathBuf {
        self.org_dir().join("teams")
    }

    /// Get the repos directory
    fn repos_dir(&self) -> PathBuf {
        self.org_dir().join("repos")
    }

    /// Get the issues directory
    fn issues_dir(&self) -> PathBuf {
        self.org_dir().join("issues")
    }

    /// Get path for a team file
    fn team_path(&self, team_name: &str) -> PathBuf {
        self.teams_dir().join(format!("{}.json", team_name))
    }

    /// Get path for a repo file
    fn repo_path(&self, repo_name: &str) -> PathBuf {
        self.repos_dir().join(format!("{}.json", repo_name))
    }

    /// Get path for an issue file
    fn issue_path(&self, repo_name: &str, issue_number: u32) -> PathBuf {
        self.issues_dir()
            .join(repo_name)
            .join(format!("{}.json", issue_number))
    }

    /// Read a JSON file
    fn read_json<T: for<'de> Deserialize<'de>>(&self, path: &Path) -> Result<T> {
        let content = fs::read_to_string(path)
            .map_err(|e| PlatformError::FileError(format!("Failed to read file: {}", e)))?;
        serde_json::from_str(&content)
            .map_err(|e| PlatformError::Other(format!("Failed to parse JSON: {}", e)))
    }

    /// Write a JSON file
    fn write_json<T: Serialize>(&self, path: &Path, data: &T) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                PlatformError::FileError(format!("Failed to create directory: {}", e))
            })?;
        }
        let content = serde_json::to_string_pretty(data)
            .map_err(|e| PlatformError::Other(format!("Failed to serialize JSON: {}", e)))?;
        fs::write(path, content)
            .map_err(|e| PlatformError::FileError(format!("Failed to write file: {}", e)))
    }

    /// List all JSON files in a directory
    fn list_json_files(&self, dir: &Path) -> Result<Vec<PathBuf>> {
        if !dir.exists() {
            return Ok(Vec::new());
        }

        let entries = fs::read_dir(dir)
            .map_err(|e| PlatformError::FileError(format!("Failed to read directory: {}", e)))?;

        let mut files = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|e| {
                PlatformError::FileError(format!("Failed to read directory entry: {}", e))
            })?;
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                files.push(path);
            }
        }
        Ok(files)
    }

    /// Get next issue number for a repository
    fn next_issue_number(&self, repo_name: &str) -> Result<u32> {
        let issue_repo_dir = self.issues_dir().join(repo_name);
        if !issue_repo_dir.exists() {
            return Ok(1);
        }

        let files = self.list_json_files(&issue_repo_dir)?;
        let max_number = files
            .iter()
            .filter_map(|path| {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .and_then(|s| s.parse::<u32>().ok())
            })
            .max()
            .unwrap_or(0);

        Ok(max_number + 1)
    }

    /// Generate a repository URL
    fn repo_url(&self, repo_name: &str) -> String {
        format!("{}/orgs/{}/{}", self.base_url, self.org_name, repo_name)
    }
}

impl PlatformAPI for LocalAPI {
    async fn create_team(
        &self,
        name: &str,
        members: Option<&[String]>,
        _permission: TeamPermission,
    ) -> Result<Team> {
        let team_path = self.team_path(name);

        // Check if team already exists
        if team_path.exists() {
            return self.read_json(&team_path);
        }

        // Create new team
        let team = Team::new(
            name.to_string(),
            members.map(|m| m.to_vec()).unwrap_or_default(),
            name.to_string(), // Use name as ID for LocalAPI
        );

        self.write_json(&team_path, &team)?;
        Ok(team)
    }

    async fn delete_team(&self, team: &Team) -> Result<()> {
        let team_path = self.team_path(&team.name);
        if !team_path.exists() {
            return Err(PlatformError::not_found(format!(
                "Team '{}' not found",
                team.name
            )));
        }

        fs::remove_file(&team_path)
            .map_err(|e| PlatformError::FileError(format!("Failed to delete team: {}", e)))
    }

    async fn get_teams(&self, team_names: Option<&[String]>) -> Result<Vec<Team>> {
        let files = self.list_json_files(&self.teams_dir())?;
        let mut teams = Vec::new();

        for file in files {
            let team: Team = self.read_json(&file)?;

            // Filter by team names if specified
            if let Some(names) = team_names {
                if names.contains(&team.name) {
                    teams.push(team);
                }
            } else {
                teams.push(team);
            }
        }

        Ok(teams)
    }

    async fn assign_repo(
        &self,
        team: &Team,
        repo: &Repo,
        _permission: TeamPermission,
    ) -> Result<()> {
        // For LocalAPI, we store the team-repo relationship in the repo's metadata
        let repo_path = self.repo_path(&repo.name);
        if !repo_path.exists() {
            return Err(PlatformError::not_found(format!(
                "Repo '{}' not found",
                repo.name
            )));
        }

        // Read repo, update team assignment (stored in description for simplicity)
        let mut stored_repo: Repo = self.read_json(&repo_path)?;
        if !stored_repo
            .description
            .contains(&format!("team:{}", team.name))
        {
            stored_repo
                .description
                .push_str(&format!(" [team:{}]", team.name));
        }
        self.write_json(&repo_path, &stored_repo)?;

        Ok(())
    }

    async fn assign_members(
        &self,
        team: &Team,
        members: &[String],
        _permission: TeamPermission,
    ) -> Result<()> {
        let team_path = self.team_path(&team.name);
        if !team_path.exists() {
            return Err(PlatformError::not_found(format!(
                "Team '{}' not found",
                team.name
            )));
        }

        let mut stored_team: Team = self.read_json(&team_path)?;

        // Add new members (avoiding duplicates)
        for member in members {
            if !stored_team.members.contains(member) {
                stored_team.members.push(member.clone());
            }
        }

        self.write_json(&team_path, &stored_team)?;
        Ok(())
    }

    async fn create_repo(
        &self,
        name: &str,
        description: &str,
        private: bool,
        team: Option<&Team>,
    ) -> Result<Repo> {
        let repo_path = self.repo_path(name);

        // If repo exists, return it
        if repo_path.exists() {
            return self.read_json(&repo_path);
        }

        // Create new repo
        let mut desc = description.to_string();
        if let Some(t) = team {
            desc.push_str(&format!(" [team:{}]", t.name));
        }

        let repo = Repo::new(name.to_string(), desc, private, self.repo_url(name));

        // Create the actual git repository directory (as a bare repo)
        let repo_dir = self.base_dir.join("orgs").join(&self.org_name).join(name);
        if !repo_dir.exists() {
            git2::Repository::init_bare(&repo_dir).map_err(|e| PlatformError::GitError(e))?;
        }

        self.write_json(&repo_path, &repo)?;
        Ok(repo)
    }

    async fn delete_repo(&self, repo: &Repo) -> Result<()> {
        let repo_path = self.repo_path(&repo.name);
        if !repo_path.exists() {
            return Err(PlatformError::not_found(format!(
                "Repo '{}' not found",
                repo.name
            )));
        }

        fs::remove_file(&repo_path)
            .map_err(|e| PlatformError::FileError(format!("Failed to delete repo: {}", e)))
    }

    async fn get_repos(&self, repo_urls: Option<&[String]>) -> Result<Vec<Repo>> {
        let files = self.list_json_files(&self.repos_dir())?;
        let mut repos = Vec::new();

        for file in files {
            let repo: Repo = self.read_json(&file)?;

            // Filter by URLs if specified
            if let Some(urls) = repo_urls {
                if urls.contains(&repo.url) {
                    repos.push(repo);
                }
            } else {
                repos.push(repo);
            }
        }

        Ok(repos)
    }

    async fn get_repo(&self, repo_name: &str, _team_name: Option<&str>) -> Result<Repo> {
        let repo_path = self.repo_path(repo_name);
        if !repo_path.exists() {
            return Err(PlatformError::not_found(format!(
                "Repo '{}' not found",
                repo_name
            )));
        }

        self.read_json(&repo_path)
    }

    async fn get_team_repos(&self, team: &Team) -> Result<Vec<Repo>> {
        let files = self.list_json_files(&self.repos_dir())?;
        let mut repos = Vec::new();

        for file in files {
            let repo: Repo = self.read_json(&file)?;
            if repo.description.contains(&format!("team:{}", team.name)) {
                repos.push(repo);
            }
        }

        Ok(repos)
    }

    fn get_repo_urls(
        &self,
        assignment_names: &[String],
        org_name: Option<&str>,
        team_names: Option<&[String]>,
        _insert_auth: bool,
    ) -> Result<Vec<String>> {
        let org = org_name.unwrap_or(&self.org_name);
        let mut urls = Vec::new();

        match team_names {
            Some(teams) => {
                for team in teams {
                    for assignment in assignment_names {
                        let repo_name = format!("{}-{}", team, assignment);
                        urls.push(format!("{}/{}/{}", self.base_url, org, repo_name));
                    }
                }
            }
            None => {
                for assignment in assignment_names {
                    urls.push(format!("{}/{}/{}", self.base_url, org, assignment));
                }
            }
        }

        Ok(urls)
    }

    async fn create_issue(
        &self,
        title: &str,
        body: &str,
        repo: &Repo,
        assignees: Option<&[String]>,
    ) -> Result<Issue> {
        let issue_number = self.next_issue_number(&repo.name)?;

        let mut issue = Issue::new(title.to_string(), body.to_string());
        issue.number = Some(issue_number);
        issue.state = Some(IssueState::Open);
        issue.author = Some(self.user.clone());
        issue.created_at = Some(chrono::Utc::now().to_rfc3339());

        // Store assignees in body for simplicity
        if let Some(assigns) = assignees {
            if !assigns.is_empty() {
                issue
                    .body
                    .push_str(&format!("\n\nAssignees: {}", assigns.join(", ")));
            }
        }

        let stored = StoredIssue {
            issue: issue.clone(),
            repo_name: repo.name.clone(),
        };

        let issue_path = self.issue_path(&repo.name, issue_number);
        self.write_json(&issue_path, &stored)?;

        Ok(issue)
    }

    async fn close_issue(&self, issue: &Issue, repo: &Repo) -> Result<()> {
        let issue_number = issue
            .number
            .ok_or_else(|| PlatformError::Other("Issue has no number".to_string()))?;

        let issue_path = self.issue_path(&repo.name, issue_number);
        if !issue_path.exists() {
            return Err(PlatformError::not_found(format!(
                "Issue #{} not found",
                issue_number
            )));
        }

        let mut stored: StoredIssue = self.read_json(&issue_path)?;
        stored.issue.state = Some(IssueState::Closed);

        self.write_json(&issue_path, &stored)?;
        Ok(())
    }

    async fn get_repo_issues(&self, repo: &Repo, state: IssueState) -> Result<Vec<Issue>> {
        let issue_repo_dir = self.issues_dir().join(&repo.name);
        if !issue_repo_dir.exists() {
            return Ok(Vec::new());
        }

        let files = self.list_json_files(&issue_repo_dir)?;
        let mut issues = Vec::new();

        for file in files {
            let stored: StoredIssue = self.read_json(&file)?;

            // Filter by state
            let matches_state = match state {
                IssueState::All => true,
                IssueState::Open => stored.issue.state == Some(IssueState::Open),
                IssueState::Closed => stored.issue.state == Some(IssueState::Closed),
            };

            if matches_state {
                issues.push(stored.issue);
            }
        }

        // Sort by issue number
        issues.sort_by_key(|i| i.number);

        Ok(issues)
    }

    fn insert_auth(&self, url: &str) -> Result<String> {
        // LocalAPI doesn't need auth in URLs
        Ok(url.to_string())
    }

    fn extract_repo_name(&self, repo_url: &str) -> Result<String> {
        repo_url
            .trim_end_matches('/')
            .split('/')
            .last()
            .map(|s| s.to_string())
            .ok_or_else(|| PlatformError::invalid_url(format!("Invalid URL: {}", repo_url)))
    }

    fn for_organization(&self, org_name: &str) -> Result<Self> {
        Self::new(
            self.base_dir.clone(),
            org_name.to_string(),
            self.user.clone(),
        )
    }

    async fn verify_settings(&self) -> Result<()> {
        // Check that base directory exists and is writable
        if !self.base_dir.exists() {
            return Err(PlatformError::FileError(format!(
                "Base directory does not exist: {}",
                self.base_dir.display()
            )));
        }

        // Try to create a test file
        let test_file = self.base_dir.join(".test");
        fs::write(&test_file, "test")
            .map_err(|e| PlatformError::FileError(format!("Directory not writable: {}", e)))?;
        fs::remove_file(&test_file)
            .map_err(|e| PlatformError::FileError(format!("Failed to cleanup test file: {}", e)))?;

        Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_test_api() -> (LocalAPI, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let api = LocalAPI::new(
            temp_dir.path().to_path_buf(),
            "test-org".to_string(),
            "test-user".to_string(),
        )
        .unwrap();
        (api, temp_dir)
    }

    #[tokio::test]
    async fn test_create_and_get_team() {
        let (api, _temp) = setup_test_api();

        let members = vec!["alice".to_string(), "bob".to_string()];
        let team = api
            .create_team("team1", Some(&members), TeamPermission::Push)
            .await
            .unwrap();

        assert_eq!(team.name, "team1");
        assert_eq!(team.members, members);

        let fetched_teams = api.get_teams(Some(&["team1".to_string()])).await.unwrap();
        assert_eq!(fetched_teams.len(), 1);
        assert_eq!(fetched_teams[0].name, "team1");
    }

    #[tokio::test]
    async fn test_create_and_get_repo() {
        let (api, _temp) = setup_test_api();

        let repo = api
            .create_repo("test-repo", "Test repository", true, None)
            .await
            .unwrap();

        assert_eq!(repo.name, "test-repo");
        assert_eq!(repo.description, "Test repository");
        assert!(repo.private);

        let fetched_repo = api.get_repo("test-repo", None).await.unwrap();
        assert_eq!(fetched_repo.name, "test-repo");
    }

    #[tokio::test]
    async fn test_assign_repo_to_team() {
        let (api, _temp) = setup_test_api();

        let team = api
            .create_team("team1", None, TeamPermission::Push)
            .await
            .unwrap();

        let repo = api
            .create_repo("test-repo", "Test", true, Some(&team))
            .await
            .unwrap();

        assert!(repo.description.contains("team:team1"));

        let team_repos = api.get_team_repos(&team).await.unwrap();
        assert_eq!(team_repos.len(), 1);
        assert_eq!(team_repos[0].name, "test-repo");
    }

    #[tokio::test]
    async fn test_create_and_close_issue() {
        let (api, _temp) = setup_test_api();

        let repo = api
            .create_repo("test-repo", "Test", true, None)
            .await
            .unwrap();

        let issue = api
            .create_issue("Bug report", "This is a bug", &repo, None)
            .await
            .unwrap();

        assert_eq!(issue.title, "Bug report");
        assert_eq!(issue.number, Some(1));
        assert_eq!(issue.state, Some(IssueState::Open));

        api.close_issue(&issue, &repo).await.unwrap();

        let closed_issues = api
            .get_repo_issues(&repo, IssueState::Closed)
            .await
            .unwrap();
        assert_eq!(closed_issues.len(), 1);
        assert_eq!(closed_issues[0].state, Some(IssueState::Closed));
    }

    #[tokio::test]
    async fn test_assign_members() {
        let (api, _temp) = setup_test_api();

        let team = api
            .create_team("team1", Some(&["alice".to_string()]), TeamPermission::Push)
            .await
            .unwrap();

        api.assign_members(
            &team,
            &["bob".to_string(), "charlie".to_string()],
            TeamPermission::Push,
        )
        .await
        .unwrap();

        let updated_teams = api.get_teams(Some(&["team1".to_string()])).await.unwrap();
        assert_eq!(updated_teams[0].members.len(), 3);
        assert!(updated_teams[0].members.contains(&"bob".to_string()));
        assert!(updated_teams[0].members.contains(&"charlie".to_string()));
    }

    #[tokio::test]
    async fn test_for_organization() {
        let (api, _temp) = setup_test_api();

        let api2 = api.for_organization("another-org").unwrap();
        assert_eq!(api2.org_name(), "another-org");
        assert_eq!(api2.base_url(), api.base_url());

        // Verify different org has separate storage
        let _repo1 = api.create_repo("repo1", "Test", true, None).await.unwrap();
        let repos_org1 = api.get_repos(None).await.unwrap();
        let repos_org2 = api2.get_repos(None).await.unwrap();

        assert_eq!(repos_org1.len(), 1);
        assert_eq!(repos_org2.len(), 0);
    }

    #[tokio::test]
    async fn test_verify_settings() {
        let (api, _temp) = setup_test_api();
        api.verify_settings().await.unwrap();
    }

    #[tokio::test]
    async fn test_get_repo_urls() {
        let (api, _temp) = setup_test_api();

        let urls = api
            .get_repo_urls(
                &["assignment1".to_string(), "assignment2".to_string()],
                None,
                Some(&["team1".to_string(), "team2".to_string()]),
                false,
            )
            .unwrap();

        assert_eq!(urls.len(), 4); // 2 assignments * 2 teams
        assert!(urls[0].contains("team1-assignment1"));
        assert!(urls[1].contains("team1-assignment2"));
    }
}
