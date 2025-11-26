//! GitHub platform implementation using REST API

use crate::error::{PlatformError, Result};
use crate::platform::PlatformAPI;
use crate::types::{Issue, IssueState, Repo, Team, TeamPermission};
use serde::{Deserialize, Serialize};

/// GitHub API client
#[derive(Debug, Clone)]
pub struct GitHubAPI {
    base_url: String,
    token: String,
    org_name: String,
    user: String,
    client: reqwest::Client,
    api_url: String,
}

// GitHub API response types
#[derive(Debug, Deserialize, Serialize)]
struct GitHubTeam {
    id: u64,
    name: String,
    slug: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct GitHubUser {
    login: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct GitHubRepo {
    name: String,
    description: Option<String>,
    private: bool,
    html_url: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct GitHubIssue {
    number: u64,
    title: String,
    body: Option<String>,
    state: String,
    created_at: String,
    user: GitHubUser,
}

#[derive(Debug, Serialize)]
struct CreateTeamRequest {
    name: String,
    description: String,
    privacy: String,
}

#[derive(Debug, Serialize)]
struct CreateRepoRequest {
    name: String,
    description: String,
    private: bool,
}

#[derive(Debug, Serialize)]
struct CreateIssueRequest {
    title: String,
    body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    assignees: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
struct UpdateIssueRequest {
    state: String,
}

impl GitHubAPI {
    /// Create a new GitHub API client
    pub fn new(base_url: String, token: String, org_name: String, user: String) -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent("repobee-rust/0.1.0")
            .build()?;

        // Determine API URL
        let api_url = if base_url.contains("github.com") {
            "https://api.github.com".to_string()
        } else {
            format!("{}/api/v3", base_url.trim_end_matches('/'))
        };

        Ok(Self {
            base_url,
            token,
            org_name,
            user,
            client,
            api_url,
        })
    }

    /// Make an authenticated GET request
    async fn get<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T> {
        let url = format!("{}{}", self.api_url, path);
        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("token {}", self.token))
            .header("Accept", "application/vnd.github.v3+json")
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Make an authenticated POST request
    async fn post<T: serde::de::DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T> {
        let url = format!("{}{}", self.api_url, path);
        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("token {}", self.token))
            .header("Accept", "application/vnd.github.v3+json")
            .json(body)
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Make an authenticated PUT request
    async fn put<T: serde::de::DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T> {
        let url = format!("{}{}", self.api_url, path);
        let response = self
            .client
            .put(&url)
            .header("Authorization", format!("token {}", self.token))
            .header("Accept", "application/vnd.github.v3+json")
            .json(body)
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Make an authenticated PUT request without body
    async fn put_empty(&self, path: &str) -> Result<()> {
        let url = format!("{}{}", self.api_url, path);
        let response = self
            .client
            .put(&url)
            .header("Authorization", format!("token {}", self.token))
            .header("Accept", "application/vnd.github.v3+json")
            .send()
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            self.convert_error(status.as_u16(), &text)
        }
    }

    /// Make an authenticated PATCH request
    async fn patch<T: serde::de::DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T> {
        let url = format!("{}{}", self.api_url, path);
        let response = self
            .client
            .patch(&url)
            .header("Authorization", format!("token {}", self.token))
            .header("Accept", "application/vnd.github.v3+json")
            .json(body)
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Make an authenticated DELETE request
    async fn delete(&self, path: &str) -> Result<()> {
        let url = format!("{}{}", self.api_url, path);
        let response = self
            .client
            .delete(&url)
            .header("Authorization", format!("token {}", self.token))
            .header("Accept", "application/vnd.github.v3+json")
            .send()
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            self.convert_error(status.as_u16(), &text)
        }
    }

    /// Handle HTTP response and convert errors
    async fn handle_response<T: serde::de::DeserializeOwned>(
        &self,
        response: reqwest::Response,
    ) -> Result<T> {
        let status = response.status();
        if status.is_success() {
            response
                .json()
                .await
                .map_err(|e| PlatformError::unexpected(format!("JSON parse error: {}", e)))
        } else {
            let text = response.text().await.unwrap_or_default();
            self.convert_error(status.as_u16(), &text)
        }
    }

    /// Convert HTTP error to PlatformError
    fn convert_error<T>(&self, status: u16, message: &str) -> Result<T> {
        match status {
            404 => Err(PlatformError::not_found(format!(
                "Resource not found: {}",
                message
            ))),
            401 | 403 => Err(PlatformError::bad_credentials(format!(
                "Authentication failed: {}",
                message
            ))),
            _ => Err(PlatformError::unexpected(format!(
                "HTTP {}: {}",
                status, message
            ))),
        }
    }

    /// Get team by name
    async fn get_team_by_name(&self, team_name: &str) -> Result<Option<GitHubTeam>> {
        let teams: Vec<GitHubTeam> = self.get(&format!("/orgs/{}/teams", self.org_name)).await?;
        Ok(teams.into_iter().find(|t| t.name == team_name))
    }

    /// Get team members
    async fn get_team_members(&self, team_slug: &str) -> Result<Vec<String>> {
        let members: Vec<GitHubUser> = self
            .get(&format!(
                "/orgs/{}/teams/{}/members",
                self.org_name, team_slug
            ))
            .await?;
        Ok(members.into_iter().map(|m| m.login).collect())
    }
}

impl PlatformAPI for GitHubAPI {
    async fn create_team(
        &self,
        name: &str,
        members: Option<&[String]>,
        _permission: TeamPermission,
    ) -> Result<Team> {
        // Check if team already exists
        if let Some(existing_team) = self.get_team_by_name(name).await? {
            let members = self.get_team_members(&existing_team.slug).await?;
            return Ok(Team::new(
                existing_team.name,
                members,
                existing_team.id.to_string(),
            ));
        }

        // Create new team
        let request = CreateTeamRequest {
            name: name.to_string(),
            description: format!("Team {}", name),
            privacy: "secret".to_string(),
        };

        let team: GitHubTeam = self
            .post(&format!("/orgs/{}/teams", self.org_name), &request)
            .await?;

        // Add members if provided
        let mut member_list = Vec::new();
        if let Some(member_names) = members {
            for member in member_names {
                self.put_empty(&format!(
                    "/orgs/{}/teams/{}/memberships/{}",
                    self.org_name, team.slug, member
                ))
                .await?;
            }
            member_list = member_names.to_vec();
        }

        Ok(Team::new(team.name, member_list, team.id.to_string()))
    }

    async fn delete_team(&self, team: &Team) -> Result<()> {
        let team_obj = self
            .get_team_by_name(&team.name)
            .await?
            .ok_or_else(|| PlatformError::not_found(format!("Team '{}' not found", team.name)))?;

        self.delete(&format!("/orgs/{}/teams/{}", self.org_name, team_obj.slug))
            .await
    }

    async fn get_teams(&self, team_names: Option<&[String]>) -> Result<Vec<Team>> {
        let teams: Vec<GitHubTeam> = self.get(&format!("/orgs/{}/teams", self.org_name)).await?;
        let mut result_teams = Vec::new();

        for team in teams {
            // Filter by team names if specified
            if let Some(names) = team_names {
                if !names.contains(&team.name) {
                    continue;
                }
            }

            let members = self.get_team_members(&team.slug).await?;
            result_teams.push(Team::new(team.name, members, team.id.to_string()));
        }

        Ok(result_teams)
    }

    async fn assign_repo(
        &self,
        team: &Team,
        repo: &Repo,
        permission: TeamPermission,
    ) -> Result<()> {
        let team_obj = self
            .get_team_by_name(&team.name)
            .await?
            .ok_or_else(|| PlatformError::not_found(format!("Team '{}' not found", team.name)))?;

        #[derive(Serialize)]
        struct TeamRepoPermission {
            permission: String,
        }

        let body = TeamRepoPermission {
            permission: permission.to_github_str().to_string(),
        };

        self.put(
            &format!(
                "/orgs/{}/teams/{}/repos/{}/{}",
                self.org_name, team_obj.slug, self.org_name, repo.name
            ),
            &body,
        )
        .await
        .map(|_: serde_json::Value| ())
    }

    async fn assign_members(
        &self,
        team: &Team,
        members: &[String],
        _permission: TeamPermission,
    ) -> Result<()> {
        let team_obj = self
            .get_team_by_name(&team.name)
            .await?
            .ok_or_else(|| PlatformError::not_found(format!("Team '{}' not found", team.name)))?;

        for member in members {
            self.put_empty(&format!(
                "/orgs/{}/teams/{}/memberships/{}",
                self.org_name, team_obj.slug, member
            ))
            .await?;
        }

        Ok(())
    }

    async fn create_repo(
        &self,
        name: &str,
        description: &str,
        private: bool,
        team: Option<&Team>,
    ) -> Result<Repo> {
        // Check if repo already exists
        match self
            .get::<GitHubRepo>(&format!("/repos/{}/{}", self.org_name, name))
            .await
        {
            Ok(existing_repo) => {
                let repo = Repo::new(
                    existing_repo.name,
                    existing_repo.description.unwrap_or_default(),
                    existing_repo.private,
                    existing_repo.html_url,
                );
                // Assign to team if provided
                if let Some(t) = team {
                    self.assign_repo(t, &repo, TeamPermission::Push).await?;
                }
                return Ok(repo);
            }
            Err(_) => {
                // Repo doesn't exist, create it
            }
        }

        // Create new repo
        let request = CreateRepoRequest {
            name: name.to_string(),
            description: description.to_string(),
            private,
        };

        let repo: GitHubRepo = self
            .post(&format!("/orgs/{}/repos", self.org_name), &request)
            .await?;
        let result_repo = Repo::new(
            repo.name,
            repo.description.unwrap_or_default(),
            repo.private,
            repo.html_url,
        );

        // Assign to team if provided
        if let Some(t) = team {
            self.assign_repo(t, &result_repo, TeamPermission::Push)
                .await?;
        }

        Ok(result_repo)
    }

    async fn delete_repo(&self, repo: &Repo) -> Result<()> {
        self.delete(&format!("/repos/{}/{}", self.org_name, repo.name))
            .await
    }

    async fn get_repos(&self, repo_urls: Option<&[String]>) -> Result<Vec<Repo>> {
        let repos: Vec<GitHubRepo> = self
            .get(&format!("/orgs/{}/repos?per_page=100", self.org_name))
            .await?;
        let mut result_repos = Vec::new();

        for repo in repos {
            let converted = Repo::new(
                repo.name,
                repo.description.unwrap_or_default(),
                repo.private,
                repo.html_url.clone(),
            );

            // Filter by URLs if specified
            if let Some(urls) = repo_urls {
                if !urls.contains(&converted.url) {
                    continue;
                }
            }

            result_repos.push(converted);
        }

        Ok(result_repos)
    }

    async fn get_repo(&self, repo_name: &str, _team_name: Option<&str>) -> Result<Repo> {
        let repo: GitHubRepo = self
            .get(&format!("/repos/{}/{}", self.org_name, repo_name))
            .await?;
        Ok(Repo::new(
            repo.name,
            repo.description.unwrap_or_default(),
            repo.private,
            repo.html_url,
        ))
    }

    async fn get_team_repos(&self, team: &Team) -> Result<Vec<Repo>> {
        let team_obj = self
            .get_team_by_name(&team.name)
            .await?
            .ok_or_else(|| PlatformError::not_found(format!("Team '{}' not found", team.name)))?;

        let repos: Vec<GitHubRepo> = self
            .get(&format!(
                "/orgs/{}/teams/{}/repos",
                self.org_name, team_obj.slug
            ))
            .await?;
        Ok(repos
            .into_iter()
            .map(|r| {
                Repo::new(
                    r.name,
                    r.description.unwrap_or_default(),
                    r.private,
                    r.html_url,
                )
            })
            .collect())
    }

    fn get_repo_urls(
        &self,
        assignment_names: &[String],
        org_name: Option<&str>,
        team_names: Option<&[String]>,
        insert_auth: bool,
    ) -> Result<Vec<String>> {
        let org = org_name.unwrap_or(&self.org_name);
        let mut urls = Vec::new();

        let base = if self.base_url.contains("github.com") {
            "https://github.com"
        } else {
            self.base_url.trim_end_matches('/')
        };

        match team_names {
            Some(teams) => {
                for team in teams {
                    for assignment in assignment_names {
                        let repo_name = format!("{}-{}", team, assignment);
                        let url = format!("{}/{}/{}.git", base, org, repo_name);
                        urls.push(if insert_auth {
                            self.insert_auth(&url)?
                        } else {
                            url
                        });
                    }
                }
            }
            None => {
                for assignment in assignment_names {
                    let url = format!("{}/{}/{}.git", base, org, assignment);
                    urls.push(if insert_auth {
                        self.insert_auth(&url)?
                    } else {
                        url
                    });
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
        let request = CreateIssueRequest {
            title: title.to_string(),
            body: body.to_string(),
            assignees: assignees.map(|a| a.to_vec()),
        };

        let issue: GitHubIssue = self
            .post(
                &format!("/repos/{}/{}/issues", self.org_name, repo.name),
                &request,
            )
            .await?;

        let state = if issue.state == "open" {
            Some(IssueState::Open)
        } else if issue.state == "closed" {
            Some(IssueState::Closed)
        } else {
            None
        };

        Ok(Issue {
            title: issue.title,
            body: issue.body.unwrap_or_default(),
            number: Some(issue.number as u32),
            created_at: Some(issue.created_at),
            author: Some(issue.user.login),
            state,
        })
    }

    async fn close_issue(&self, issue: &Issue, repo: &Repo) -> Result<()> {
        let issue_number = issue
            .number
            .ok_or_else(|| PlatformError::Other("Issue has no number".to_string()))?;

        let request = UpdateIssueRequest {
            state: "closed".to_string(),
        };

        self.patch::<serde_json::Value, _>(
            &format!(
                "/repos/{}/{}/issues/{}",
                self.org_name, repo.name, issue_number
            ),
            &request,
        )
        .await
        .map(|_| ())
    }

    async fn get_repo_issues(&self, repo: &Repo, state: IssueState) -> Result<Vec<Issue>> {
        let state_str = match state {
            IssueState::Open => "open",
            IssueState::Closed => "closed",
            IssueState::All => "all",
        };

        let issues: Vec<GitHubIssue> = self
            .get(&format!(
                "/repos/{}/{}/issues?state={}&per_page=100",
                self.org_name, repo.name, state_str
            ))
            .await?;

        Ok(issues
            .into_iter()
            .map(|i| {
                let state = if i.state == "open" {
                    Some(IssueState::Open)
                } else if i.state == "closed" {
                    Some(IssueState::Closed)
                } else {
                    None
                };

                Issue {
                    title: i.title,
                    body: i.body.unwrap_or_default(),
                    number: Some(i.number as u32),
                    created_at: Some(i.created_at),
                    author: Some(i.user.login),
                    state,
                }
            })
            .collect())
    }

    fn insert_auth(&self, url: &str) -> Result<String> {
        // GitHub uses token authentication in URLs like: https://oauth2:TOKEN@github.com/...
        if let Some(idx) = url.find("://") {
            let (protocol, rest) = url.split_at(idx + 3);
            Ok(format!("{}oauth2:{}@{}", protocol, self.token, rest))
        } else {
            Err(PlatformError::invalid_url(format!(
                "Invalid URL format: {}",
                url
            )))
        }
    }

    fn extract_repo_name(&self, repo_url: &str) -> Result<String> {
        let url = repo_url.trim_end_matches('/').trim_end_matches(".git");
        url.split('/')
            .last()
            .map(|s| s.to_string())
            .ok_or_else(|| PlatformError::invalid_url(format!("Invalid URL: {}", repo_url)))
    }

    fn for_organization(&self, org_name: &str) -> Result<Self> {
        Ok(Self {
            base_url: self.base_url.clone(),
            token: self.token.clone(),
            org_name: org_name.to_string(),
            user: self.user.clone(),
            client: self.client.clone(),
            api_url: self.api_url.clone(),
        })
    }

    async fn verify_settings(&self) -> Result<()> {
        // Verify we can access the organization
        #[derive(Deserialize)]
        struct OrgResponse {
            login: String,
        }
        let org: OrgResponse = self.get(&format!("/orgs/{}", self.org_name)).await?;
        // Verify the org name matches
        if org.login != self.org_name {
            return Err(PlatformError::unexpected(format!(
                "Organization name mismatch: expected '{}', got '{}'",
                self.org_name, org.login
            )));
        }
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
