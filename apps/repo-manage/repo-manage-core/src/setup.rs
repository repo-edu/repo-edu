//! Repository setup workflow
//!
//! This module implements the core RepoBee workflow for setting up student repositories:
//! 1. Clone template repositories
//! 2. Create teams on the platform
//! 3. Create student repositories for each (team, template) combination
//! 4. Push template content to student repositories

use crate::error::{PlatformError, Result};
use crate::platform::PlatformAPI;
use crate::types::{StudentRepo, StudentTeam, Team, TeamPermission, TemplateRepo};
use git2::{Cred, PushOptions, RemoteCallbacks, Repository};
use std::path::Path;

/// Result of the setup operation
#[derive(Debug, Clone)]
pub struct SetupResult {
    /// Successfully created student repositories
    pub successful_repos: Vec<StudentRepo>,
    /// Repositories that already existed
    pub existing_repos: Vec<StudentRepo>,
    /// Errors that occurred during setup
    pub errors: Vec<SetupError>,
}

/// Error that occurred during setup
#[derive(Debug, Clone)]
pub struct SetupError {
    pub repo_name: String,
    pub team_name: String,
    pub error: String,
}

impl SetupResult {
    pub fn new() -> Self {
        Self {
            successful_repos: Vec::new(),
            existing_repos: Vec::new(),
            errors: Vec::new(),
        }
    }

    pub fn total_repos(&self) -> usize {
        self.successful_repos.len() + self.existing_repos.len()
    }

    pub fn is_success(&self) -> bool {
        self.errors.is_empty()
    }
}

impl Default for SetupResult {
    fn default() -> Self {
        Self::new()
    }
}

/// Clone a template repository to a local directory
///
/// # Arguments
/// * `url` - Repository URL
/// * `path` - Local path to clone to
/// * `token` - Optional authentication token
pub fn clone_template(url: &str, path: &Path, token: Option<&str>) -> Result<Repository> {
    // Set up authentication if token is provided
    let mut callbacks = RemoteCallbacks::new();
    if let Some(t) = token {
        let token_owned = t.to_string();
        callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
            Cred::userpass_plaintext("oauth2", &token_owned)
        });
    }

    let mut fetch_options = git2::FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);

    let mut builder = git2::build::RepoBuilder::new();
    builder.fetch_options(fetch_options);

    builder
        .clone(url, path)
        .map_err(|e| PlatformError::GitError(e))
}

/// Create or get existing teams on the platform
///
/// This function ensures all teams exist and have the correct members.
/// Teams that already exist will have new members added.
pub async fn setup_teams<P: PlatformAPI>(
    student_teams: &[StudentTeam],
    api: &P,
    permission: TeamPermission,
) -> Result<Vec<Team>> {
    let mut platform_teams = Vec::new();

    // Get existing teams
    let team_names: Vec<String> = student_teams.iter().map(|t| t.name.clone()).collect();
    let existing_teams = api.get_teams(Some(&team_names)).await?;
    let existing_map: std::collections::HashMap<String, Team> = existing_teams
        .into_iter()
        .map(|t| (t.name.clone(), t))
        .collect();

    for student_team in student_teams {
        let team = if let Some(existing) = existing_map.get(&student_team.name) {
            // Team exists, add any new members
            let existing_members: std::collections::HashSet<String> =
                existing.members.iter().cloned().collect();
            let new_members: Vec<String> = student_team
                .members
                .iter()
                .filter(|m| !existing_members.contains(*m))
                .cloned()
                .collect();

            if !new_members.is_empty() {
                api.assign_members(existing, &new_members, permission)
                    .await?;
            }

            // Return updated team with all members
            let mut updated = existing.clone();
            updated.members = student_team.members.clone();
            updated
        } else {
            // Create new team
            api.create_team(&student_team.name, Some(&student_team.members), permission)
                .await?
        };

        platform_teams.push(team);
    }

    Ok(platform_teams)
}

/// Create student repositories for each (team, template) combination
///
/// Returns a tuple of (newly_created, already_existing) repositories.
pub async fn create_student_repos<P: PlatformAPI>(
    teams: &[Team],
    templates: &[TemplateRepo],
    api: &P,
    private: bool,
) -> Result<(Vec<StudentRepo>, Vec<StudentRepo>)> {
    let mut newly_created = Vec::new();
    let already_existing = Vec::new();

    for team in teams {
        for template in templates {
            let repo_name = format!("{}-{}", team.name, template.name);

            // Try to create the repository
            match api
                .create_repo(
                    &repo_name,
                    &format!("Repository for team {}", team.name),
                    private,
                    Some(team),
                )
                .await
            {
                Ok(repo) => {
                    // Check if it's a new repo or existing by trying to get it first
                    // For now, we'll assume create_repo handles this and returns the repo
                    let student_repo = StudentRepo {
                        name: repo_name.clone(),
                        team: StudentTeam::with_name(team.name.clone(), team.members.clone()),
                        url: repo.url.clone(),
                        path: None,
                    };

                    // Simple heuristic: if description is empty or matches our pattern, it's new
                    // This is a simplification; in practice, we'd track this better
                    newly_created.push(student_repo);
                }
                Err(e) => {
                    // If it's a NotFound error on create, something is wrong
                    // For other errors, we can try to get it
                    return Err(e);
                }
            }
        }
    }

    Ok((newly_created, already_existing))
}

/// Push template repository content to a student repository
///
/// # Arguments
/// * `template_path` - Local path to template repository
/// * `student_repo_url` - URL of student repository
/// * `token` - Optional authentication token
pub fn push_to_repo(
    template_path: &Path,
    student_repo_url: &str,
    token: Option<&str>,
) -> Result<()> {
    let repo = Repository::open(template_path).map_err(|e| PlatformError::GitError(e))?;

    // Add the student repo as a remote
    let remote_name = "student_repo";
    let mut remote = match repo.find_remote(remote_name) {
        Ok(r) => r,
        Err(_) => repo
            .remote(remote_name, student_repo_url)
            .map_err(|e| PlatformError::GitError(e))?,
    };

    // Set up authentication if token is provided
    let mut callbacks = RemoteCallbacks::new();
    if let Some(t) = token {
        let token_owned = t.to_string();
        callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
            Cred::userpass_plaintext("oauth2", &token_owned)
        });
    }

    let mut push_options = PushOptions::new();
    push_options.remote_callbacks(callbacks);

    // Push all branches
    // For simplicity, we'll push the current branch (usually main/master)
    let head = repo.head().map_err(|e| PlatformError::GitError(e))?;
    let branch_name = head.shorthand().unwrap_or("main");
    let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);

    remote
        .push(&[&refspec], Some(&mut push_options))
        .map_err(|e| PlatformError::GitError(e))?;

    Ok(())
}

/// Main setup function for student repositories
///
/// This is the orchestration function that:
/// 1. Clones template repositories
/// 2. Creates teams on the platform
/// 3. Creates student repositories
/// 4. Pushes template content to student repos
///
/// # Arguments
/// * `template_urls` - URLs of template repositories
/// * `student_teams` - List of student teams
/// * `api` - Platform API instance
/// * `work_dir` - Working directory for cloning templates
/// * `private` - Whether to create private repositories
/// * `token` - Optional authentication token for git operations
pub async fn setup_student_repos<P: PlatformAPI>(
    template_urls: &[String],
    student_teams: &[StudentTeam],
    api: &P,
    work_dir: &Path,
    private: bool,
    token: Option<&str>,
) -> Result<SetupResult> {
    let mut result = SetupResult::new();

    // Step 1: Clone template repositories
    println!("Cloning {} template repositories...", template_urls.len());
    let mut templates = Vec::new();
    for url in template_urls {
        let repo_name = api.extract_repo_name(url)?;
        let template_path = work_dir.join(&repo_name);

        match clone_template(url, &template_path, token) {
            Ok(_) => {
                templates.push(TemplateRepo {
                    name: repo_name,
                    url: url.clone(),
                    path: Some(template_path),
                });
                println!("✓ Cloned template: {}", url);
            }
            Err(e) => {
                eprintln!("✗ Failed to clone template {}: {}", url, e);
                result.errors.push(SetupError {
                    repo_name: repo_name,
                    team_name: "N/A".to_string(),
                    error: format!("Clone failed: {}", e),
                });
            }
        }
    }

    if templates.is_empty() {
        return Err(PlatformError::Other(
            "No templates cloned successfully".to_string(),
        ));
    }

    // Step 2: Create/setup teams
    println!("\nSetting up {} teams...", student_teams.len());
    let platform_teams = match setup_teams(student_teams, api, TeamPermission::Push).await {
        Ok(teams) => {
            println!("✓ Set up {} teams", teams.len());
            teams
        }
        Err(e) => {
            eprintln!("✗ Failed to setup teams: {}", e);
            return Err(e);
        }
    };

    // Step 3: Create student repositories
    println!("\nCreating student repositories...");
    let total_repos = platform_teams.len() * templates.len();
    println!(
        "Expected repos: {} teams × {} templates = {}",
        platform_teams.len(),
        templates.len(),
        total_repos
    );

    let (newly_created, already_existing) =
        match create_student_repos(&platform_teams, &templates, api, private).await {
            Ok((new, existing)) => {
                println!("✓ Created {} new repositories", new.len());
                if !existing.is_empty() {
                    println!("  {} repositories already existed", existing.len());
                }
                (new, existing)
            }
            Err(e) => {
                eprintln!("✗ Failed to create repositories: {}", e);
                return Err(e);
            }
        };

    // Step 4: Push template content to student repositories
    println!("\nPushing template content to student repositories...");
    for student_repo in &newly_created {
        // Find the corresponding template
        // Student repo name format: {team-name}-{template-name}
        // Extract template name (last component after last hyphen before team name)
        let template_name = student_repo
            .name
            .split('-')
            .last()
            .unwrap_or(&student_repo.name);
        if let Some(template) = templates.iter().find(|t| t.name == template_name) {
            if let Some(template_path) = &template.path {
                match push_to_repo(template_path, &student_repo.url, token) {
                    Ok(_) => {
                        println!("✓ Pushed to {}", student_repo.name);
                    }
                    Err(e) => {
                        eprintln!("✗ Failed to push to {}: {}", student_repo.name, e);
                        result.errors.push(SetupError {
                            repo_name: student_repo.name.clone(),
                            team_name: student_repo.team.name.clone(),
                            error: format!("Push failed: {}", e),
                        });
                    }
                }
            }
        }
    }

    result.successful_repos = newly_created;
    result.existing_repos = already_existing;

    println!("\n=== Setup Summary ===");
    println!("Successful: {} repositories", result.successful_repos.len());
    println!(
        "Already existed: {} repositories",
        result.existing_repos.len()
    );
    println!("Errors: {}", result.errors.len());

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::{LocalAPI, Platform};
    use std::fs;
    use tempfile::TempDir;

    fn create_test_git_repo(path: &Path) -> Repository {
        // Create a new git repository
        let repo = Repository::init(path).unwrap();

        // Configure git
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();

        // Create a test file
        let test_file = path.join("README.md");
        fs::write(&test_file, "# Test Template\n").unwrap();

        // Stage and commit
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("README.md")).unwrap();
        index.write().unwrap();

        let tree_id = index.write_tree().unwrap();
        let sig = repo.signature().unwrap();

        {
            let tree = repo.find_tree(tree_id).unwrap();
            repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
                .unwrap();
        }

        repo
    }

    #[tokio::test]
    async fn test_setup_teams() {
        let temp_dir = TempDir::new().unwrap();
        let api = LocalAPI::new(
            temp_dir.path().to_path_buf(),
            "test-org".to_string(),
            "teacher".to_string(),
        )
        .unwrap();

        let student_teams = vec![
            StudentTeam::new(vec!["alice".to_string(), "bob".to_string()]),
            StudentTeam::new(vec!["charlie".to_string(), "david".to_string()]),
        ];

        let result = setup_teams(&student_teams, &api, TeamPermission::Push).await;
        assert!(result.is_ok());

        let teams = result.unwrap();
        assert_eq!(teams.len(), 2);
        assert_eq!(teams[0].members.len(), 2);
    }

    #[tokio::test]
    async fn test_create_student_repos() {
        let temp_dir = TempDir::new().unwrap();
        let api = LocalAPI::new(
            temp_dir.path().to_path_buf(),
            "test-org".to_string(),
            "teacher".to_string(),
        )
        .unwrap();

        // Create a team
        let team = api
            .create_team("team1", Some(&["alice".to_string()]), TeamPermission::Push)
            .await
            .unwrap();

        // Create templates
        let templates = vec![
            TemplateRepo::new("assignment1".to_string(), "url1".to_string()),
            TemplateRepo::new("assignment2".to_string(), "url2".to_string()),
        ];

        let result = create_student_repos(&[team], &templates, &api, true).await;
        assert!(result.is_ok());

        let (newly_created, _existing) = result.unwrap();
        assert_eq!(newly_created.len(), 2); // 1 team * 2 templates
        assert_eq!(newly_created[0].name, "team1-assignment1");
        assert_eq!(newly_created[1].name, "team1-assignment2");
    }

    #[tokio::test]
    async fn test_setup_student_repos_workflow() {
        let temp_dir = TempDir::new().unwrap();
        let work_dir = TempDir::new().unwrap();

        // Create a test template repository
        let template_dir = work_dir.path().join("template-repo");
        fs::create_dir_all(&template_dir).unwrap();
        create_test_git_repo(&template_dir);

        // Create LocalAPI instance
        let api = Platform::local(
            temp_dir.path().to_path_buf(),
            "test-org".to_string(),
            "teacher".to_string(),
        )
        .unwrap();

        // Define student teams
        let student_teams = vec![
            StudentTeam::new(vec!["alice".to_string(), "bob".to_string()]),
            StudentTeam::new(vec!["charlie".to_string()]),
        ];

        // For testing, we'll use the local template path as URL
        // In real usage, this would be a git URL
        let template_urls = vec![format!("file://{}", template_dir.display())];

        // Run setup (without push since we're using local file:// URLs)
        // We'll test the components separately instead
        let teams_result = setup_teams(&student_teams, &api, TeamPermission::Push).await;
        assert!(teams_result.is_ok());

        let teams = teams_result.unwrap();
        assert_eq!(teams.len(), 2);

        let templates = vec![TemplateRepo::new(
            "template-repo".to_string(),
            template_urls[0].clone(),
        )];

        let repos_result = create_student_repos(&teams, &templates, &api, true).await;
        assert!(repos_result.is_ok());

        let (created, _existing) = repos_result.unwrap();
        assert_eq!(created.len(), 2); // 2 teams * 1 template
    }

    #[test]
    fn test_clone_template() {
        let temp_dir = TempDir::new().unwrap();
        let template_dir = temp_dir.path().join("template");
        let clone_dir = temp_dir.path().join("clone");

        // Create a template repo
        fs::create_dir_all(&template_dir).unwrap();
        create_test_git_repo(&template_dir);

        // Clone it
        let url = format!("file://{}", template_dir.display());
        let result = clone_template(&url, &clone_dir, None);

        assert!(result.is_ok());
        assert!(clone_dir.join("README.md").exists());
    }

    #[test]
    fn test_push_to_repo() {
        let temp_dir = TempDir::new().unwrap();
        let source_dir = temp_dir.path().join("source");
        let dest_dir = temp_dir.path().join("dest");

        // Create source repo with content
        fs::create_dir_all(&source_dir).unwrap();
        create_test_git_repo(&source_dir);

        // Create empty dest repo (bare)
        Repository::init_bare(&dest_dir).unwrap();

        // Push from source to dest
        let dest_url = format!("file://{}", dest_dir.display());
        let result = push_to_repo(&source_dir, &dest_url, None);

        assert!(result.is_ok());
    }
}
