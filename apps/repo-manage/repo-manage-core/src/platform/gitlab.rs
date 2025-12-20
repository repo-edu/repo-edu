//! GitLab platform implementation

use crate::error::{PlatformError, Result};
use crate::platform::PlatformAPI;
use crate::types::{Issue, IssueState, Repo, RepoCreateResult, Team, TeamPermission};
use reqwest::header;
use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use url::form_urlencoded::byte_serialize;

/// GitLab API client
#[derive(Debug, Clone)]
pub struct GitLabAPI {
    base_url: String,
    api_url: String,
    token: String,
    org_name: String,
    user: String,
    client: Client,
    auth_user: String,
}

#[derive(Debug, Deserialize)]
struct GitLabGroup {
    id: u64,
    name: String,
    path: String,
    full_path: String,
}

#[derive(Debug, Deserialize)]
struct GitLabUser {
    id: u64,
    username: String,
}

#[derive(Debug, Deserialize)]
struct GitLabProject {
    id: u64,
    path: String,
    description: Option<String>,
    visibility: String,
    http_url_to_repo: String,
}

#[derive(Debug, Deserialize)]
struct GitLabIssue {
    iid: u64,
    title: String,
    description: Option<String>,
    state: String,
    created_at: String,
    author: GitLabUser,
}

#[derive(Debug, Deserialize)]
struct GitLabMember {
    username: String,
    access_level: u32,
}

#[derive(Debug, Deserialize)]
struct GitLabAuthUser {
    username: String,
}

#[derive(Debug, Serialize)]
struct CreateGroupRequest {
    name: String,
    path: String,
    parent_id: u64,
    default_branch_protection: u32,
}

#[derive(Debug, Serialize)]
struct CreateProjectRequest {
    name: String,
    path: String,
    description: String,
    visibility: String,
    namespace_id: u64,
}

#[derive(Debug, Serialize)]
struct AddMemberRequest {
    user_id: u64,
    access_level: u32,
}

#[derive(Debug, Serialize)]
struct ShareProjectRequest {
    group_id: u64,
    group_access: u32,
}

#[derive(Debug, Serialize)]
struct CreateIssueRequest {
    title: String,
    description: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    assignee_ids: Vec<u64>,
}

#[derive(Debug, Serialize)]
struct UpdateIssueRequest {
    state_event: String,
}

impl GitLabAPI {
    /// Create a new GitLab API client
    pub fn new(base_url: String, token: String, org_name: String, user: String) -> Result<Self> {
        let base_url = base_url.trim_end_matches('/').to_string();
        let (base_url, api_url) = if base_url.ends_with("/api/v4") {
            (
                base_url.trim_end_matches("/api/v4").to_string(),
                base_url.clone(),
            )
        } else {
            (base_url.clone(), format!("{}/api/v4", base_url))
        };

        let client = Client::builder().user_agent("repobee-rust/0.1.0").build()?;

        let api = Self {
            base_url,
            api_url,
            token,
            org_name,
            user,
            client,
            auth_user: "oauth2".to_string(),
        };
        Ok(api)
    }

    fn encode_path(path: &str) -> String {
        byte_serialize(path.as_bytes()).collect()
    }

    fn api_url(&self, path: &str) -> String {
        format!("{}{}", self.api_url, path)
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

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        let url = self.api_url(path);
        self.client
            .request(method, url)
            .header("PRIVATE-TOKEN", &self.token)
            .header(header::ACCEPT, "application/json")
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
            let paged_path = format!("{path}{separator}per_page=100&page={page}");
            let mut page_items: Vec<T> = self.get(&paged_path).await?;
            let count = page_items.len();
            results.append(&mut page_items);
            if count < 100 {
                break;
            }
            page += 1;
        }
        Ok(results)
    }

    async fn get_group_by_path(&self, group_path: &str) -> Result<GitLabGroup> {
        let encoded = Self::encode_path(group_path);
        self.get(&format!("/groups/{}", encoded)).await
    }

    async fn get_group_members(&self, group_id: u64) -> Result<Vec<GitLabMember>> {
        self.get_paginated(&format!("/groups/{}/members/all", group_id))
            .await
    }

    async fn get_users_by_username(&self, username: &str) -> Result<Vec<GitLabUser>> {
        self.get(&format!("/users?username={}", Self::encode_path(username)))
            .await
    }

    fn project_path_from_url(&self, repo_url: &str) -> Result<String> {
        let parsed = url::Url::parse(repo_url)
            .map_err(|_| PlatformError::invalid_url(format!("Invalid URL: {}", repo_url)))?;
        let path = parsed
            .path()
            .trim_start_matches('/')
            .trim_end_matches(".git");
        if path.is_empty() {
            return Err(PlatformError::invalid_url(format!(
                "Invalid URL: {}",
                repo_url
            )));
        }
        Ok(path.to_string())
    }

    async fn get_project_by_path(&self, project_path: &str) -> Result<GitLabProject> {
        let encoded = Self::encode_path(project_path);
        self.get(&format!("/projects/{}", encoded)).await
    }

    async fn get_project_by_repo(&self, repo: &Repo) -> Result<GitLabProject> {
        let path = self.project_path_from_url(&repo.url)?;
        self.get_project_by_path(&path).await
    }

    fn wrap_project(&self, project: GitLabProject) -> Repo {
        Repo::new(
            project.path,
            project.description.unwrap_or_default(),
            project.visibility == "private",
            project.http_url_to_repo,
        )
    }

    fn wrap_issue(&self, issue: GitLabIssue) -> Issue {
        let state = match issue.state.as_str() {
            "opened" => Some(IssueState::Open),
            "closed" => Some(IssueState::Closed),
            _ => None,
        };
        Issue {
            title: issue.title,
            body: issue.description.unwrap_or_default(),
            number: Some(issue.iid as u32),
            created_at: Some(issue.created_at),
            author: Some(issue.author.username),
            state,
        }
    }

    fn group_id_from_team(&self, team: &Team) -> Result<u64> {
        team.id
            .parse::<u64>()
            .map_err(|_| PlatformError::Other(format!("Invalid GitLab group id: {}", team.id)))
    }
}

impl PlatformAPI for GitLabAPI {
    async fn create_team(
        &self,
        name: &str,
        members: Option<&[String]>,
        permission: TeamPermission,
    ) -> Result<Team> {
        let group = self.get_group_by_path(&self.org_name).await?;
        let request = CreateGroupRequest {
            name: name.to_string(),
            path: name.to_string(),
            parent_id: group.id,
            default_branch_protection: 0,
        };

        let group: GitLabGroup = self.post("/groups", &request).await?;
        let team = Team::new(group.name.clone(), Vec::new(), group.id.to_string());

        if let Some(members) = members {
            self.assign_members(&team, members, permission).await?;
        }

        let members = self
            .get_group_members(group.id)
            .await?
            .into_iter()
            .filter(|m| m.access_level != 50)
            .map(|m| m.username)
            .collect();

        Ok(Team::new(group.name, members, group.id.to_string()))
    }

    async fn delete_team(&self, team: &Team) -> Result<()> {
        let group_id = self.group_id_from_team(team)?;
        self.delete(&format!("/groups/{}", group_id)).await
    }

    async fn get_teams(&self, team_names: Option<&[String]>) -> Result<Vec<Team>> {
        let parent = self.get_group_by_path(&self.org_name).await?;
        let groups: Vec<GitLabGroup> = self
            .get_paginated(&format!("/groups/{}/subgroups", parent.id))
            .await?;
        let mut result = Vec::new();
        for group in groups {
            if let Some(names) = team_names {
                if !names.contains(&group.path) && !names.contains(&group.name) {
                    continue;
                }
            }
            let members = self
                .get_group_members(group.id)
                .await?
                .into_iter()
                .filter(|m| m.access_level != 50)
                .map(|m| m.username)
                .collect();
            result.push(Team::new(group.name, members, group.id.to_string()));
        }
        Ok(result)
    }

    async fn assign_repo(
        &self,
        team: &Team,
        repo: &Repo,
        permission: TeamPermission,
    ) -> Result<()> {
        let group_id = self.group_id_from_team(team)?;
        let project = self.get_project_by_repo(repo).await?;
        let request = ShareProjectRequest {
            group_id,
            group_access: permission.to_gitlab_access_level(),
        };
        let response = self
            .request(
                reqwest::Method::POST,
                &format!("/projects/{}/share", project.id),
            )
            .json(&request)
            .send()
            .await?;
        if response.status().as_u16() == 409 || response.status().is_success() {
            return Ok(());
        }
        self.handle_response::<serde_json::Value>(response)
            .await
            .map(|_| ())
    }

    async fn assign_members(
        &self,
        team: &Team,
        members: &[String],
        permission: TeamPermission,
    ) -> Result<()> {
        let group_id = self.group_id_from_team(team)?;
        for member in members {
            let users = self.get_users_by_username(member).await?;
            let Some(user) = users.first() else {
                continue;
            };
            let request = AddMemberRequest {
                user_id: user.id,
                access_level: permission.to_gitlab_access_level(),
            };
            let response = self
                .request(
                    reqwest::Method::POST,
                    &format!("/groups/{}/members", group_id),
                )
                .json(&request)
                .send()
                .await?;
            if response.status().as_u16() == 409 || response.status().is_success() {
                continue;
            }
            self.handle_response::<serde_json::Value>(response).await?;
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
        let group = self.get_group_by_path(&self.org_name).await?;
        let (namespace_id, project_path) = if let Some(team) = team {
            let group_id = self.group_id_from_team(team)?;
            let path = format!("{}/{}/{}", group.full_path, team.name, name);
            (group_id, path)
        } else {
            let path = format!("{}/{}", group.full_path, name);
            (group.id, path)
        };

        match self.get_project_by_path(&project_path).await {
            Ok(project) => {
                let repo = self.wrap_project(project);
                return Ok(RepoCreateResult {
                    repo,
                    created: false,
                });
            }
            Err(PlatformError::NotFound(_)) => {}
            Err(e) => return Err(e),
        }

        let request = CreateProjectRequest {
            name: name.to_string(),
            path: name.to_string(),
            description: description.to_string(),
            visibility: if private { "private" } else { "public" }.to_string(),
            namespace_id,
        };

        let project: GitLabProject = self.post("/projects", &request).await?;
        let repo = self.wrap_project(project);

        Ok(RepoCreateResult {
            repo,
            created: true,
        })
    }

    async fn delete_repo(&self, repo: &Repo) -> Result<()> {
        let project = self.get_project_by_repo(repo).await?;
        self.delete(&format!("/projects/{}", project.id)).await
    }

    async fn get_repos(&self, repo_urls: Option<&[String]>) -> Result<Vec<Repo>> {
        if let Some(urls) = repo_urls {
            let group = self.get_group_by_path(&self.org_name).await?;
            let mut found = Vec::new();
            for url in urls {
                let name = self.extract_repo_name(url)?;
                let candidates: Vec<GitLabProject> = self
                    .get_paginated(&format!(
                        "/groups/{}/projects?include_subgroups=true&search={}",
                        group.id,
                        Self::encode_path(&name)
                    ))
                    .await?;
                for candidate in candidates {
                    if candidate.http_url_to_repo == *url {
                        found.push(self.wrap_project(candidate));
                    }
                }
            }
            return Ok(found);
        }

        let group = self.get_group_by_path(&self.org_name).await?;
        let projects: Vec<GitLabProject> = self
            .get_paginated(&format!(
                "/groups/{}/projects?include_subgroups=true",
                group.id
            ))
            .await?;
        Ok(projects.into_iter().map(|p| self.wrap_project(p)).collect())
    }

    async fn get_repo(&self, repo_name: &str, team_name: Option<&str>) -> Result<Repo> {
        let group = self.get_group_by_path(&self.org_name).await?;
        let path = if let Some(team_name) = team_name {
            format!("{}/{}/{}", group.full_path, team_name, repo_name)
        } else {
            format!("{}/{}", group.full_path, repo_name)
        };
        let project = self.get_project_by_path(&path).await?;
        Ok(self.wrap_project(project))
    }

    async fn get_team_repos(&self, team: &Team) -> Result<Vec<Repo>> {
        let group_id = self.group_id_from_team(team)?;
        let projects: Vec<GitLabProject> = self
            .get_paginated(&format!("/groups/{}/projects", group_id))
            .await?;
        Ok(projects.into_iter().map(|p| self.wrap_project(p)).collect())
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
                    let url = format!("{}/{}/{}/{}.git", self.base_url, org, team, repo_name);
                    urls.push(if insert_auth {
                        self.insert_auth(&url)?
                    } else {
                        url
                    });
                }
            }
        } else {
            for assignment in assignment_names {
                let url = format!("{}/{}/{}.git", self.base_url, org, assignment);
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
        let project = self.get_project_by_repo(repo).await?;
        let mut assignee_ids = Vec::new();
        if let Some(assignees) = assignees {
            for name in assignees {
                let users = self.get_users_by_username(name).await?;
                if let Some(user) = users.first() {
                    assignee_ids.push(user.id);
                }
            }
        }
        let request = CreateIssueRequest {
            title: title.to_string(),
            description: body.to_string(),
            assignee_ids,
        };
        let issue: GitLabIssue = self
            .post(&format!("/projects/{}/issues", project.id), &request)
            .await?;
        Ok(self.wrap_issue(issue))
    }

    async fn close_issue(&self, issue: &Issue, repo: &Repo) -> Result<()> {
        let project = self.get_project_by_repo(repo).await?;
        let issue_number = issue
            .number
            .ok_or_else(|| PlatformError::Other("Issue has no number".to_string()))?;
        let request = UpdateIssueRequest {
            state_event: "close".to_string(),
        };
        self.put::<serde_json::Value, _>(
            &format!("/projects/{}/issues/{}", project.id, issue_number),
            &request,
        )
        .await
        .map(|_| ())
    }

    async fn get_repo_issues(&self, repo: &Repo, state: IssueState) -> Result<Vec<Issue>> {
        let project = self.get_project_by_repo(repo).await?;
        let state_str = match state {
            IssueState::Open => "opened",
            IssueState::Closed => "closed",
            IssueState::All => "all",
        };
        let issues: Vec<GitLabIssue> = self
            .get_paginated(&format!(
                "/projects/{}/issues?state={}",
                project.id, state_str
            ))
            .await?;
        Ok(issues.into_iter().map(|i| self.wrap_issue(i)).collect())
    }

    fn insert_auth(&self, url: &str) -> Result<String> {
        let parsed = url::Url::parse(url)
            .map_err(|_| PlatformError::invalid_url(format!("Invalid URL: {}", url)))?;
        if parsed.scheme() != "https" {
            return Err(PlatformError::invalid_url(format!(
                "Unsupported protocol in '{}'",
                url
            )));
        }
        let mut authed = parsed.clone();
        authed
            .set_username(&self.auth_user)
            .map_err(|_| PlatformError::invalid_url(format!("Invalid URL: {}", url)))?;
        authed
            .set_password(Some(&self.token))
            .map_err(|_| PlatformError::invalid_url(format!("Invalid URL: {}", url)))?;
        if authed.username().is_empty() {
            return Err(PlatformError::invalid_url(format!("Invalid URL: {}", url)));
        }
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
        GitLabAPI::new(
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

        let auth_user: GitLabAuthUser = self.get("/user").await?;
        let group = self.get_group_by_path(&self.org_name).await?;
        let members = self.get_group_members(group.id).await?;
        let member_usernames: Vec<String> = members.iter().map(|m| m.username.clone()).collect();
        if !member_usernames.contains(&auth_user.username) {
            return Err(PlatformError::bad_credentials(format!(
                "User '{}' is not a member of group '{}'",
                auth_user.username, group.name
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

#[cfg(test)]
mod tests {
    use super::*;

    fn group_json() -> &'static str {
        r#"{"id":1,"name":"org","path":"org","full_path":"org"}"#
    }

    fn project_json() -> &'static str {
        r#"{"id":10,"path":"repo1","description":"desc","visibility":"private","http_url_to_repo":"https://gitlab.example.org/org/repo1.git"}"#
    }

    #[tokio::test]
    async fn create_repo_existing_returns_created_false() {
        let mut server = mockito::Server::new_async().await;
        let base_url = format!("{}/api/v4", server.url());

        let _group_mock = server
            .mock("GET", "/api/v4/groups/org")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(group_json())
            .create_async()
            .await;

        let _project_mock = server
            .mock("GET", "/api/v4/projects/org%2Frepo1")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(project_json())
            .create_async()
            .await;

        let api = GitLabAPI::new(base_url, "token".into(), "org".into(), "user".into()).unwrap();
        let result = api.create_repo("repo1", "desc", true, None).await.unwrap();

        assert!(!result.created);
        assert_eq!(result.repo.url, "https://gitlab.example.org/org/repo1.git");
    }

    #[tokio::test]
    async fn create_repo_new_returns_created_true() {
        let mut server = mockito::Server::new_async().await;
        let base_url = format!("{}/api/v4", server.url());

        let _group_mock = server
            .mock("GET", "/api/v4/groups/org")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(group_json())
            .create_async()
            .await;

        let _missing_project = server
            .mock("GET", "/api/v4/projects/org%2Frepo1")
            .with_status(404)
            .create_async()
            .await;

        let _create_project = server
            .mock("POST", "/api/v4/projects")
            .with_status(201)
            .with_header("content-type", "application/json")
            .with_body(project_json())
            .create_async()
            .await;

        let api = GitLabAPI::new(base_url, "token".into(), "org".into(), "user".into()).unwrap();
        let result = api.create_repo("repo1", "desc", true, None).await.unwrap();

        assert!(result.created);
        assert_eq!(result.repo.url, "https://gitlab.example.org/org/repo1.git");
    }

    #[test]
    fn get_repo_urls_with_teams() {
        let api = GitLabAPI::new(
            "https://gitlab.example.org".into(),
            "t".into(),
            "org".into(),
            "user".into(),
        )
        .unwrap();
        let urls = api
            .get_repo_urls(
                &["assignment".to_string()],
                None,
                Some(&["team1".to_string()]),
                false,
            )
            .unwrap();
        assert_eq!(
            urls,
            vec!["https://gitlab.example.org/org/team1/team1-assignment.git".to_string()]
        );
    }
}
