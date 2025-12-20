//! Gitea platform implementation

use crate::error::{PlatformError, Result};
use crate::platform::PlatformAPI;
use crate::types::{Issue, IssueState, Repo, RepoCreateResult, Team, TeamPermission};
use reqwest::header;
use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

/// Gitea API client
#[derive(Debug, Clone)]
pub struct GiteaAPI {
    base_url: String,
    base_html_url: String,
    token: String,
    org_name: String,
    user: String,
    client: Client,
}

#[derive(Debug, Deserialize)]
struct GiteaTeam {
    id: u64,
    name: String,
}

#[derive(Debug, Deserialize)]
struct GiteaUser {
    login: String,
    id: u64,
}

#[derive(Debug, Deserialize)]
struct GiteaRepo {
    name: String,
    description: Option<String>,
    private: bool,
    clone_url: String,
    owner: GiteaUser,
}

#[derive(Debug, Deserialize)]
struct GiteaIssue {
    number: u64,
    title: String,
    body: Option<String>,
    state: String,
    created_at: String,
    user: GiteaUser,
    repository: Option<GiteaRepo>,
}

#[derive(Debug, Serialize)]
struct CreateTeamRequest {
    description: String,
    includes_all_repositories: bool,
    name: String,
    permission: String,
    units: Vec<String>,
}

#[derive(Debug, Serialize)]
struct CreateRepoRequest {
    name: String,
    description: String,
    auto_init: bool,
    private: bool,
    default_branch: String,
}

#[derive(Debug, Serialize)]
struct CreateIssueRequest {
    title: String,
    body: String,
    assignees: Vec<String>,
}

#[derive(Debug, Serialize)]
struct CloseIssueRequest {
    state: String,
}

impl GiteaAPI {
    /// Create a new Gitea API client
    pub fn new(base_url: String, token: String, org_name: String, user: String) -> Result<Self> {
        let base_url = base_url.trim_end_matches('/').to_string();
        let base_html_url = if let Some(stripped) = base_url.strip_suffix("/api/v1") {
            stripped.to_string()
        } else {
            base_url.clone()
        };

        let client = Client::builder().user_agent("repobee-rust/0.1.0").build()?;

        Ok(Self {
            base_url,
            base_html_url,
            token,
            org_name,
            user,
            client,
        })
    }

    fn api_url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        let url = self.api_url(path);
        self.client
            .request(method, url)
            .header("Authorization", format!("token {}", self.token))
            .header(header::ACCEPT, "application/json")
    }

    async fn handle_response<T: DeserializeOwned>(&self, response: reqwest::Response) -> Result<T> {
        let status = response.status();
        if status.is_success() {
            response
                .json()
                .await
                .map_err(|e| PlatformError::unexpected(format!("JSON parse error: {}", e)))
        } else {
            let code = status.as_u16();
            let message = response.text().await.unwrap_or_default();
            match code {
                404 => Err(PlatformError::not_found(message)),
                401 | 403 => Err(PlatformError::bad_credentials(message)),
                503 => Err(PlatformError::ServiceNotFound(message)),
                _ => Err(PlatformError::unexpected(format!(
                    "HTTP {}: {}",
                    code, message
                ))),
            }
        }
    }

    async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let response = self.request(reqwest::Method::GET, path).send().await?;
        self.handle_response(response).await
    }

    async fn post<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> Result<T> {
        let response = self
            .request(reqwest::Method::POST, path)
            .json(body)
            .send()
            .await?;
        self.handle_response(response).await
    }

    async fn put<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> Result<T> {
        let response = self
            .request(reqwest::Method::PUT, path)
            .json(body)
            .send()
            .await?;
        self.handle_response(response).await
    }

    async fn patch<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> Result<T> {
        let response = self
            .request(reqwest::Method::PATCH, path)
            .json(body)
            .send()
            .await?;
        self.handle_response(response).await
    }

    async fn delete(&self, path: &str) -> Result<()> {
        let response = self.request(reqwest::Method::DELETE, path).send().await?;
        let status = response.status();
        if status.is_success() {
            Ok(())
        } else {
            let code = status.as_u16();
            let message = response.text().await.unwrap_or_default();
            match code {
                404 => Err(PlatformError::not_found(message)),
                401 | 403 => Err(PlatformError::bad_credentials(message)),
                _ => Err(PlatformError::unexpected(format!(
                    "HTTP {}: {}",
                    code, message
                ))),
            }
        }
    }

    async fn get_paginated<T: DeserializeOwned>(&self, path: &str) -> Result<Vec<T>> {
        let mut page = 1;
        let mut results = Vec::new();
        loop {
            let separator = if path.contains('?') { "&" } else { "?" };
            let paged_path = format!("{path}{separator}page={page}&limit=50");
            let mut page_items: Vec<T> = self.get(&paged_path).await?;
            let count = page_items.len();
            results.append(&mut page_items);
            if count < 50 {
                break;
            }
            page += 1;
        }
        Ok(results)
    }

    fn wrap_repo(&self, repo_data: GiteaRepo) -> Repo {
        Repo::new(
            repo_data.name,
            repo_data.description.unwrap_or_default(),
            repo_data.private,
            repo_data.clone_url,
        )
    }

    fn owner_from_repo(&self, repo: &Repo) -> String {
        if let Ok(parsed) = url::Url::parse(&repo.url) {
            if let Some(owner) = parsed.path_segments().and_then(|mut s| s.next()) {
                return owner.to_string();
            }
        }
        self.org_name.clone()
    }
}

impl PlatformAPI for GiteaAPI {
    async fn create_team(
        &self,
        name: &str,
        members: Option<&[String]>,
        permission: TeamPermission,
    ) -> Result<Team> {
        let request = CreateTeamRequest {
            description: name.to_string(),
            includes_all_repositories: false,
            name: name.to_string(),
            permission: permission.to_gitea_str().to_string(),
            units: vec![
                "repo.code".to_string(),
                "repo.issues".to_string(),
                "repo.ext_issues".to_string(),
                "repo.wiki".to_string(),
                "repo.pulls".to_string(),
                "repo.releases".to_string(),
                "repo.ext_wiki".to_string(),
            ],
        };

        let team: GiteaTeam = self
            .post(&format!("/orgs/{}/teams", self.org_name), &request)
            .await?;

        if let Some(members) = members {
            self.assign_members(
                &Team::new(name.to_string(), Vec::new(), team.id.to_string()),
                members,
                permission,
            )
            .await?;
        }

        let members = self
            .get_paginated::<GiteaUser>(&format!("/teams/{}/members", team.id))
            .await?
            .into_iter()
            .map(|u| u.login)
            .collect();

        Ok(Team::new(name.to_string(), members, team.id.to_string()))
    }

    async fn delete_team(&self, team: &Team) -> Result<()> {
        self.delete(&format!("/teams/{}", team.id)).await
    }

    async fn get_teams(&self, team_names: Option<&[String]>) -> Result<Vec<Team>> {
        let teams: Vec<GiteaTeam> = self
            .get_paginated(&format!("/orgs/{}/teams", self.org_name))
            .await?;
        let mut result = Vec::new();
        for team in teams {
            if let Some(names) = team_names {
                if !names.contains(&team.name) {
                    continue;
                }
            }
            let members = self
                .get_paginated::<GiteaUser>(&format!("/teams/{}/members", team.id))
                .await?
                .into_iter()
                .map(|u| u.login)
                .collect();
            result.push(Team::new(team.name, members, team.id.to_string()));
        }
        Ok(result)
    }

    async fn assign_repo(
        &self,
        team: &Team,
        repo: &Repo,
        _permission: TeamPermission,
    ) -> Result<()> {
        let response = self
            .request(
                reqwest::Method::PUT,
                &format!("/teams/{}/repos/{}/{}", team.id, self.org_name, repo.name),
            )
            .send()
            .await?;
        if response.status().is_success() {
            Ok(())
        } else {
            self.handle_response::<serde_json::Value>(response)
                .await
                .map(|_| ())
        }
    }

    async fn assign_members(
        &self,
        team: &Team,
        members: &[String],
        _permission: TeamPermission,
    ) -> Result<()> {
        for member in members {
            let response = self
                .request(
                    reqwest::Method::PUT,
                    &format!("/teams/{}/members/{}", team.id, member),
                )
                .send()
                .await?;
            if !response.status().is_success() {
                self.handle_response::<serde_json::Value>(response).await?;
            }
        }
        Ok(())
    }

    async fn create_repo(
        &self,
        name: &str,
        description: &str,
        private: bool,
        team: Option<&Team>,
    ) -> Result<RepoCreateResult> {
        match self.get_repo(name, None).await {
            Ok(repo) => {
                return Ok(RepoCreateResult {
                    repo,
                    created: false,
                });
            }
            Err(PlatformError::NotFound(_)) => {}
            Err(e) => return Err(e),
        }

        let request = CreateRepoRequest {
            name: name.to_string(),
            description: description.to_string(),
            auto_init: false,
            private,
            default_branch: "main".to_string(),
        };

        let repo: GiteaRepo = self
            .post(&format!("/orgs/{}/repos", self.org_name), &request)
            .await?;
        let wrapped = self.wrap_repo(repo);

        if let Some(team) = team {
            self.assign_repo(team, &wrapped, TeamPermission::Push)
                .await?;
        }

        Ok(RepoCreateResult {
            repo: wrapped,
            created: true,
        })
    }

    async fn delete_repo(&self, repo: &Repo) -> Result<()> {
        self.delete(&format!("/repos/{}/{}", self.org_name, repo.name))
            .await
    }

    async fn get_repos(&self, repo_urls: Option<&[String]>) -> Result<Vec<Repo>> {
        if let Some(urls) = repo_urls {
            let mut repos = Vec::new();
            for url in urls {
                let name = self.extract_repo_name(url)?;
                if let Ok(repo) = self.get_repo(&name, None).await {
                    repos.push(repo);
                }
            }
            return Ok(repos);
        }

        let repos: Vec<GiteaRepo> = self
            .get_paginated(&format!("/orgs/{}/repos", self.org_name))
            .await?;
        Ok(repos.into_iter().map(|r| self.wrap_repo(r)).collect())
    }

    async fn get_repo(&self, repo_name: &str, _team_name: Option<&str>) -> Result<Repo> {
        let repo: GiteaRepo = self
            .get(&format!("/repos/{}/{}", self.org_name, repo_name))
            .await?;
        Ok(self.wrap_repo(repo))
    }

    async fn get_team_repos(&self, team: &Team) -> Result<Vec<Repo>> {
        let repos: Vec<GiteaRepo> = self
            .get_paginated(&format!("/teams/{}/repos", team.id))
            .await?;
        Ok(repos.into_iter().map(|r| self.wrap_repo(r)).collect())
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

        if let Some(teams) = team_names {
            for team in teams {
                for assignment in assignment_names {
                    let repo_name = format!("{}-{}", team, assignment);
                    let url = format!("{}/{}/{}.git", self.base_html_url, org, repo_name);
                    urls.push(if insert_auth {
                        self.insert_auth(&url)?
                    } else {
                        url
                    });
                }
            }
        } else {
            for assignment in assignment_names {
                let url = format!("{}/{}/{}.git", self.base_html_url, org, assignment);
                urls.push(if insert_auth {
                    self.insert_auth(&url)?
                } else {
                    url
                });
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
        let owner = self.owner_from_repo(repo);
        let request = CreateIssueRequest {
            title: title.to_string(),
            body: body.to_string(),
            assignees: assignees.unwrap_or(&[]).to_vec(),
        };
        let issue: GiteaIssue = self
            .post(&format!("/repos/{}/{}/issues", owner, repo.name), &request)
            .await?;
        let state = match issue.state.as_str() {
            "open" => Some(IssueState::Open),
            "closed" => Some(IssueState::Closed),
            _ => None,
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
        let owner = self.owner_from_repo(repo);
        let issue_number = issue
            .number
            .ok_or_else(|| PlatformError::Other("Issue has no number".to_string()))?;
        let request = CloseIssueRequest {
            state: "closed".to_string(),
        };
        self.patch::<serde_json::Value, _>(
            &format!("/repos/{}/{}/issues/{}", owner, repo.name, issue_number),
            &request,
        )
        .await
        .map(|_| ())
    }

    async fn get_repo_issues(&self, repo: &Repo, state: IssueState) -> Result<Vec<Issue>> {
        let owner = self.owner_from_repo(repo);
        let state_str = state.to_gitea_str();
        let issues: Vec<GiteaIssue> = self
            .get_paginated(&format!(
                "/repos/{}/{}/issues?state={}",
                owner, repo.name, state_str
            ))
            .await?;
        Ok(issues
            .into_iter()
            .map(|issue| {
                let state = match issue.state.as_str() {
                    "open" => Some(IssueState::Open),
                    "closed" => Some(IssueState::Closed),
                    _ => None,
                };
                Issue {
                    title: issue.title,
                    body: issue.body.unwrap_or_default(),
                    number: Some(issue.number as u32),
                    created_at: Some(issue.created_at),
                    author: Some(issue.user.login),
                    state,
                }
            })
            .collect())
    }

    fn insert_auth(&self, url: &str) -> Result<String> {
        let parsed = url::Url::parse(url)
            .map_err(|_| PlatformError::invalid_url(format!("Invalid URL: {}", url)))?;
        let mut authed = parsed.clone();
        authed
            .set_username(&self.user)
            .map_err(|_| PlatformError::invalid_url(format!("Invalid URL: {}", url)))?;
        authed
            .set_password(Some(&self.token))
            .map_err(|_| PlatformError::invalid_url(format!("Invalid URL: {}", url)))?;
        Ok(authed.to_string())
    }

    fn extract_repo_name(&self, repo_url: &str) -> Result<String> {
        let parsed = url::Url::parse(repo_url)
            .map_err(|_| PlatformError::invalid_url(format!("Invalid URL: {}", repo_url)))?;
        let path = parsed.path().trim_end_matches('/');
        let name = std::path::Path::new(path)
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or_else(|| PlatformError::invalid_url(format!("Invalid URL: {}", repo_url)))?;
        Ok(name.to_string())
    }

    fn for_organization(&self, org_name: &str) -> Result<Self> {
        GiteaAPI::new(
            self.base_url.clone(),
            self.token.clone(),
            org_name.to_string(),
            self.user.clone(),
        )
    }

    async fn verify_settings(&self) -> Result<()> {
        if self.token.is_empty() {
            return Err(PlatformError::bad_credentials(
                "Token is empty. Provide a valid token.",
            ));
        }

        let _version: serde_json::Value = self.get("/version").await?;
        let user: GiteaUser = self.get("/user").await?;
        if user.login != self.user {
            return Err(PlatformError::bad_credentials(format!(
                "Token does not belong to user '{}'",
                self.user
            )));
        }
        let _: serde_json::Value = self.get(&format!("/orgs/{}", self.org_name)).await?;
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

    fn repo_json() -> &'static str {
        r#"{"name":"repo1","description":"desc","private":true,"clone_url":"https://gitea.example.org/org/repo1.git","owner":{"login":"org","id":1}}"#
    }

    #[tokio::test]
    async fn create_repo_existing_returns_created_false() {
        let mut server = mockito::Server::new_async().await;
        let base_url = format!("{}/api/v1", server.url());

        let _get_repo = server
            .mock("GET", "/api/v1/repos/org/repo1")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(repo_json())
            .create_async()
            .await;

        let api = GiteaAPI::new(base_url, "token".into(), "org".into(), "user".into()).unwrap();
        let result = api.create_repo("repo1", "desc", true, None).await.unwrap();

        assert!(!result.created);
        assert_eq!(result.repo.url, "https://gitea.example.org/org/repo1.git");
    }

    #[tokio::test]
    async fn create_repo_new_returns_created_true() {
        let mut server = mockito::Server::new_async().await;
        let base_url = format!("{}/api/v1", server.url());

        let _missing_repo = server
            .mock("GET", "/api/v1/repos/org/repo1")
            .with_status(404)
            .create_async()
            .await;

        let _create_repo = server
            .mock("POST", "/api/v1/orgs/org/repos")
            .with_status(201)
            .with_header("content-type", "application/json")
            .with_body(repo_json())
            .create_async()
            .await;

        let api = GiteaAPI::new(base_url, "token".into(), "org".into(), "user".into()).unwrap();
        let result = api.create_repo("repo1", "desc", true, None).await.unwrap();

        assert!(result.created);
        assert_eq!(result.repo.url, "https://gitea.example.org/org/repo1.git");
    }

    #[test]
    fn insert_auth_adds_credentials() {
        let api = GiteaAPI::new(
            "https://gitea.example.org/api/v1".into(),
            "token".into(),
            "org".into(),
            "user".into(),
        )
        .unwrap();
        let url = api
            .insert_auth("https://gitea.example.org/org/repo1.git")
            .unwrap();
        assert_eq!(url, "https://user:token@gitea.example.org/org/repo1.git");
    }

    #[test]
    fn get_repo_urls_uses_html_base() {
        let api = GiteaAPI::new(
            "https://gitea.example.org/api/v1".into(),
            "token".into(),
            "org".into(),
            "user".into(),
        )
        .unwrap();
        let urls = api
            .get_repo_urls(&["assignment".to_string()], None, None, false)
            .unwrap();
        assert_eq!(
            urls,
            vec!["https://gitea.example.org/org/assignment.git".to_string()]
        );
    }
}
