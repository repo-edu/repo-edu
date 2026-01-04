use crate::error::AppError;
use crate::generated::types::{
    AssignmentId, CloneConfig, CreateConfig, DeleteConfig, Group, OperationError, OperationResult,
    RepoCollision, RepoPreflightResult, Roster, SkippedGroup, SkippedGroupReason,
};
use repo_manage_core::platform::{GitHubAPI, GitLabAPI, GiteaAPI, Platform, PlatformAPI};
use repo_manage_core::roster::{compute_repo_name, Assignment};
use repo_manage_core::{
    GitConnection, GitServerType, GitVerifyResult, PlatformError, ProfileSettings, SettingsManager,
    SetupParams as CoreSetupParams, StudentTeam, VerifyParams,
};
use std::path::PathBuf;

use super::types::{CloneParams, CommandResult, ConfigParams, SetupParams};
use super::utils::canonicalize_dir;

/// Build a Platform client from profile and app settings
/// Uses the target_org from profile settings
fn build_platform_from_profile(profile: &str) -> Result<(Platform, ProfileSettings), AppError> {
    let manager = SettingsManager::new()?;
    let app_settings = manager.load_app_settings()?;
    let load_result = manager.load_profile(profile)?;
    let profile_settings = load_result.settings;

    let connection_name = profile_settings
        .git_connection
        .as_ref()
        .ok_or_else(|| AppError::new("No git connection configured for this profile"))?;

    let connection = app_settings
        .git_connections
        .get(connection_name)
        .cloned()
        .ok_or_else(|| AppError::new(format!("Git connection '{}' not found", connection_name)))?;

    let base_url = match connection.server_type {
        GitServerType::GitHub => connection
            .connection
            .base_url
            .clone()
            .unwrap_or_else(|| "https://github.com".to_string()),
        GitServerType::GitLab | GitServerType::Gitea => connection
            .connection
            .base_url
            .clone()
            .ok_or_else(|| AppError::new("Git connection base URL is required"))?,
    };

    let target_org = &profile_settings.operations.target_org;

    let platform = match connection.server_type {
        GitServerType::GitHub => Platform::github(
            base_url,
            connection.connection.access_token.clone(),
            target_org.clone(),
            connection.connection.user.clone(),
        )?,
        GitServerType::GitLab => Platform::gitlab(
            base_url,
            connection.connection.access_token.clone(),
            target_org.clone(),
            connection.connection.user.clone(),
        )?,
        GitServerType::Gitea => Platform::gitea(
            base_url,
            connection.connection.access_token.clone(),
            target_org.clone(),
            connection.connection.user.clone(),
        )?,
    };

    Ok((platform, profile_settings))
}

use crate::generated::types::Assignment as GenAssignment;

/// Find an assignment by ID in a roster
fn find_assignment<'a>(
    roster: &'a Roster,
    assignment_id: &AssignmentId,
) -> Option<&'a GenAssignment> {
    roster.assignments.iter().find(|a| a.id == *assignment_id)
}

/// Get groups that are valid for operations (non-empty)
fn get_valid_groups(assignment: &GenAssignment) -> Vec<&Group> {
    assignment
        .groups
        .iter()
        .filter(|g| !g.member_ids.is_empty())
        .collect()
}

/// Convert generated Assignment to core Assignment for compute_repo_name
fn to_core_assignment(assignment: &GenAssignment) -> Assignment {
    Assignment {
        id: repo_manage_core::roster::AssignmentId(assignment.id.0.clone()),
        name: assignment.name.clone(),
        groups: assignment
            .groups
            .iter()
            .map(|g| repo_manage_core::roster::Group {
                id: repo_manage_core::roster::GroupId(g.id.0.clone()),
                name: g.name.clone(),
                member_ids: g
                    .member_ids
                    .iter()
                    .map(|id| repo_manage_core::roster::StudentId(id.0.clone()))
                    .collect(),
            })
            .collect(),
        lms_group_set_id: assignment.lms_group_set_id.clone(),
    }
}

/// Convert generated Group to core Group for compute_repo_name
fn to_core_group(group: &Group) -> repo_manage_core::roster::Group {
    repo_manage_core::roster::Group {
        id: repo_manage_core::roster::GroupId(group.id.0.clone()),
        name: group.name.clone(),
        member_ids: group
            .member_ids
            .iter()
            .map(|id| repo_manage_core::roster::StudentId(id.0.clone()))
            .collect(),
    }
}

/// Verify platform configuration and authentication
#[tauri::command]
pub async fn verify_config(params: ConfigParams) -> Result<CommandResult, AppError> {
    let verify_params = VerifyParams {
        platform_type: None, // Auto-detect from URL
        base_url: params.base_url.clone(),
        access_token: params.access_token,
        organization: params.student_repos.clone(),
        user: params.user.clone(),
    };

    repo_manage_core::verify_platform(&verify_params, |_| {}).await?;

    let platform_name = if params.base_url.starts_with('/') || params.base_url.contains("local") {
        "Local (filesystem)"
    } else {
        &params.base_url
    };

    Ok(CommandResult {
        success: true,
        message: format!(
            "✓ Configuration verified successfully for {}",
            params.student_repos
        ),
        details: Some(format!(
            "Platform: {}\nOrganization: {}\nUser: {}",
            platform_name, params.student_repos, params.user
        )),
    })
}

/// Create student repositories from templates
#[tauri::command]
pub async fn setup_repos(params: SetupParams) -> Result<CommandResult, AppError> {
    // Parse YAML file to get student teams
    let yaml_content = std::fs::read_to_string(&params.yaml_file)
        .map_err(|e| AppError::new(format!("Failed to read YAML file: {}", e)))?;

    let student_teams: Vec<StudentTeam> = serde_yaml::from_str(&yaml_content)
        .map_err(|e| AppError::new(format!("Failed to parse YAML file: {}", e)))?;

    // Parse assignments (comma-separated template names)
    let templates: Vec<String> = params
        .assignments
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    if templates.is_empty() {
        return Err(AppError::new("No assignments specified"));
    }

    // Determine work directory
    let work_dir = PathBuf::from("./repobee-work");

    // Build setup params
    let setup_params = CoreSetupParams {
        platform_type: None, // Auto-detect from URL
        base_url: params.config.base_url.clone(),
        access_token: params.config.access_token.clone(),
        organization: params.config.student_repos.clone(),
        user: params.config.user.clone(),
        template_org: if params.config.template.is_empty() {
            None
        } else {
            Some(params.config.template.clone())
        },
        templates,
        student_teams,
        work_dir,
        private: true,
    };

    let result = repo_manage_core::setup_repos(&setup_params, |_| {}).await?;

    let details = format!(
        "Successfully created: {} repositories\nAlready existed: {} repositories\nErrors: {}",
        result.successful_repos.len(),
        result.existing_repos.len(),
        result.errors.len()
    );

    if result.is_success() {
        Ok(CommandResult {
            success: true,
            message: "Student repositories created successfully!".to_string(),
            details: Some(details),
        })
    } else {
        let error_details = result
            .errors
            .iter()
            .map(|e| format!("  - {}/{}: {}", e.team_name, e.repo_name, e.error))
            .collect::<Vec<_>>()
            .join("\n");

        Ok(CommandResult {
            success: false,
            message: format!("Setup completed with {} errors", result.errors.len()),
            details: Some(format!("{}\n\nErrors:\n{}", details, error_details)),
        })
    }
}

/// Clone student repositories (stub for now)
#[tauri::command]
pub async fn clone_repos(params: CloneParams) -> Result<CommandResult, AppError> {
    // Validate target folder exists before doing any work
    let _target_path = canonicalize_dir(&params.target_folder)
        .map_err(|e| AppError::with_details("Target folder is invalid", e.to_string()))?;

    // TODO: Implement clone functionality
    Err(AppError::new("Clone functionality not yet implemented"))
}

#[tauri::command]
pub async fn verify_git_connection(name: String) -> Result<GitVerifyResult, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.load_app_settings()?;
    let connection = settings
        .git_connections
        .get(&name)
        .cloned()
        .ok_or_else(|| AppError::new("Git connection not found"))?;
    verify_git_connection_with(&connection).await
}

#[tauri::command]
pub async fn verify_git_connection_draft(
    connection: GitConnection,
) -> Result<GitVerifyResult, AppError> {
    verify_git_connection_with(&connection).await
}

async fn verify_git_connection_with(
    connection: &GitConnection,
) -> Result<GitVerifyResult, AppError> {
    let base_url = match connection.server_type {
        GitServerType::GitHub => connection
            .connection
            .base_url
            .clone()
            .unwrap_or_else(|| "https://github.com".to_string()),
        GitServerType::GitLab | GitServerType::Gitea => connection
            .connection
            .base_url
            .clone()
            .ok_or_else(|| AppError::new("Git connection base URL is required"))?,
    };

    let username = match connection.server_type {
        GitServerType::GitHub => {
            let api = GitHubAPI::new(
                base_url.clone(),
                connection.connection.access_token.clone(),
                String::new(),
                connection.connection.user.clone(),
            )?;
            api.get_authenticated_username().await?
        }
        GitServerType::GitLab => {
            let api = GitLabAPI::new(
                base_url.clone(),
                connection.connection.access_token.clone(),
                String::new(),
                connection.connection.user.clone(),
            )?;
            api.get_authenticated_username().await?
        }
        GitServerType::Gitea => {
            let api = GiteaAPI::new(
                base_url,
                connection.connection.access_token.clone(),
                String::new(),
                connection.connection.user.clone(),
            )?;
            api.get_authenticated_username().await?
        }
    };

    Ok(GitVerifyResult {
        success: true,
        message: format!("Connected as @{}", username),
        username: Some(username),
    })
}

// ============================================================================
// Roster-based Git Operations
// ============================================================================

/// Preflight check for create: identifies repos that already exist
#[tauri::command]
pub async fn preflight_create_repos(
    profile: String,
    roster: Roster,
    assignment_id: AssignmentId,
    _config: CreateConfig,
) -> Result<RepoPreflightResult, AppError> {
    let (platform, profile_settings) = build_platform_from_profile(&profile)?;

    let assignment = find_assignment(&roster, &assignment_id)
        .ok_or_else(|| AppError::new("Assignment not found"))?;

    let template = &profile_settings.operations.repo_name_template;
    let valid_groups = get_valid_groups(assignment);
    let core_assignment = to_core_assignment(assignment);

    let mut collisions = Vec::new();

    for group in valid_groups.iter() {
        let core_group = to_core_group(group);
        let repo_name = compute_repo_name(template, &core_assignment, &core_group);

        // Check if repo exists
        match platform.get_repo(&repo_name, None).await {
            Ok(_) => {
                // Repo exists - this is a collision for create
                collisions.push(RepoCollision {
                    group_id: group.id.clone(),
                    group_name: group.name.clone(),
                    repo_name,
                });
            }
            Err(PlatformError::NotFound(_)) => {
                // Repo doesn't exist - good for create
            }
            Err(e) => return Err(AppError::new(format!("Failed to check repo: {}", e))),
        }
    }

    let ready_count = (valid_groups.len() - collisions.len()) as i64;

    Ok(RepoPreflightResult {
        collisions,
        ready_count,
    })
}

/// Preflight check for clone: identifies repos that don't exist
#[tauri::command]
pub async fn preflight_clone_repos(
    profile: String,
    roster: Roster,
    assignment_id: AssignmentId,
    _config: CloneConfig,
) -> Result<RepoPreflightResult, AppError> {
    let (platform, profile_settings) = build_platform_from_profile(&profile)?;

    let assignment = find_assignment(&roster, &assignment_id)
        .ok_or_else(|| AppError::new("Assignment not found"))?;

    let template = &profile_settings.operations.repo_name_template;
    let valid_groups = get_valid_groups(assignment);
    let core_assignment = to_core_assignment(assignment);

    let mut collisions = Vec::new();

    for group in valid_groups.iter() {
        let core_group = to_core_group(group);
        let repo_name = compute_repo_name(template, &core_assignment, &core_group);

        // Check if repo exists
        match platform.get_repo(&repo_name, None).await {
            Ok(_) => {
                // Repo exists - good for clone
            }
            Err(PlatformError::NotFound(_)) => {
                // Repo doesn't exist - this is a collision for clone
                collisions.push(RepoCollision {
                    group_id: group.id.clone(),
                    group_name: group.name.clone(),
                    repo_name,
                });
            }
            Err(e) => return Err(AppError::new(format!("Failed to check repo: {}", e))),
        }
    }

    let ready_count = (valid_groups.len() - collisions.len()) as i64;

    Ok(RepoPreflightResult {
        collisions,
        ready_count,
    })
}

/// Preflight check for delete: identifies repos that don't exist
#[tauri::command]
pub async fn preflight_delete_repos(
    profile: String,
    roster: Roster,
    assignment_id: AssignmentId,
    _config: DeleteConfig,
) -> Result<RepoPreflightResult, AppError> {
    // Same logic as clone - repos that don't exist are collisions
    let (platform, profile_settings) = build_platform_from_profile(&profile)?;

    let assignment = find_assignment(&roster, &assignment_id)
        .ok_or_else(|| AppError::new("Assignment not found"))?;

    let template = &profile_settings.operations.repo_name_template;
    let valid_groups = get_valid_groups(assignment);
    let core_assignment = to_core_assignment(assignment);

    let mut collisions = Vec::new();

    for group in valid_groups.iter() {
        let core_group = to_core_group(group);
        let repo_name = compute_repo_name(template, &core_assignment, &core_group);

        match platform.get_repo(&repo_name, None).await {
            Ok(_) => {
                // Repo exists - good for delete
            }
            Err(PlatformError::NotFound(_)) => {
                // Repo doesn't exist - this is a collision for delete
                collisions.push(RepoCollision {
                    group_id: group.id.clone(),
                    group_name: group.name.clone(),
                    repo_name,
                });
            }
            Err(e) => return Err(AppError::new(format!("Failed to check repo: {}", e))),
        }
    }

    let ready_count = (valid_groups.len() - collisions.len()) as i64;

    Ok(RepoPreflightResult {
        collisions,
        ready_count,
    })
}

/// Create repos for assignment groups
#[tauri::command]
pub async fn create_repos(
    profile: String,
    roster: Roster,
    assignment_id: AssignmentId,
    _config: CreateConfig,
) -> Result<OperationResult, AppError> {
    let (platform, profile_settings) = build_platform_from_profile(&profile)?;

    let assignment = find_assignment(&roster, &assignment_id)
        .ok_or_else(|| AppError::new("Assignment not found"))?;

    let template = &profile_settings.operations.repo_name_template;
    let valid_groups = get_valid_groups(assignment);
    let core_assignment = to_core_assignment(assignment);

    let mut succeeded = 0i64;
    let mut failed = 0i64;
    let mut skipped_groups = Vec::new();
    let mut errors = Vec::new();

    // Skip empty groups
    for group in assignment.groups.iter() {
        if group.member_ids.is_empty() {
            skipped_groups.push(SkippedGroup {
                assignment_id: assignment_id.clone(),
                group_id: group.id.clone(),
                group_name: group.name.clone(),
                reason: SkippedGroupReason::EmptyGroup,
                context: None,
            });
        }
    }

    for group in valid_groups.iter() {
        let core_group = to_core_group(group);
        let repo_name = compute_repo_name(template, &core_assignment, &core_group);

        match platform.create_repo(&repo_name, "", true, None).await {
            Ok(result) => {
                if result.created {
                    succeeded += 1;
                } else {
                    // Repo already existed
                    skipped_groups.push(SkippedGroup {
                        assignment_id: assignment_id.clone(),
                        group_id: group.id.clone(),
                        group_name: group.name.clone(),
                        reason: SkippedGroupReason::RepoExists,
                        context: Some(repo_name),
                    });
                }
            }
            Err(e) => {
                failed += 1;
                errors.push(OperationError {
                    repo_name,
                    message: e.to_string(),
                });
            }
        }
    }

    Ok(OperationResult {
        succeeded,
        failed,
        skipped_groups,
        errors,
    })
}

/// Clone repos for assignment groups
#[tauri::command]
pub async fn clone_repos_from_roster(
    profile: String,
    roster: Roster,
    assignment_id: AssignmentId,
    config: CloneConfig,
) -> Result<OperationResult, AppError> {
    let (platform, profile_settings) = build_platform_from_profile(&profile)?;

    let assignment = find_assignment(&roster, &assignment_id)
        .ok_or_else(|| AppError::new("Assignment not found"))?;

    let template = &profile_settings.operations.repo_name_template;
    let valid_groups = get_valid_groups(assignment);
    let core_assignment = to_core_assignment(assignment);

    let target_dir = PathBuf::from(&config.target_dir);
    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir)
            .map_err(|e| AppError::new(format!("Failed to create target directory: {}", e)))?;
    }

    let mut succeeded = 0i64;
    let mut failed = 0i64;
    let mut skipped_groups = Vec::new();
    let mut errors = Vec::new();

    // Skip empty groups
    for group in assignment.groups.iter() {
        if group.member_ids.is_empty() {
            skipped_groups.push(SkippedGroup {
                assignment_id: assignment_id.clone(),
                group_id: group.id.clone(),
                group_name: group.name.clone(),
                reason: SkippedGroupReason::EmptyGroup,
                context: None,
            });
        }
    }

    for group in valid_groups.iter() {
        let core_group = to_core_group(group);
        let repo_name = compute_repo_name(template, &core_assignment, &core_group);

        // Check if repo exists first
        let repo = match platform.get_repo(&repo_name, None).await {
            Ok(r) => r,
            Err(PlatformError::NotFound(_)) => {
                skipped_groups.push(SkippedGroup {
                    assignment_id: assignment_id.clone(),
                    group_id: group.id.clone(),
                    group_name: group.name.clone(),
                    reason: SkippedGroupReason::RepoNotFound,
                    context: Some(repo_name),
                });
                continue;
            }
            Err(e) => {
                failed += 1;
                errors.push(OperationError {
                    repo_name,
                    message: e.to_string(),
                });
                continue;
            }
        };

        // Build clone URL with auth
        let clone_url = match platform.insert_auth(&repo.url) {
            Ok(url) => url,
            Err(e) => {
                failed += 1;
                errors.push(OperationError {
                    repo_name,
                    message: format!("Failed to build clone URL: {}", e),
                });
                continue;
            }
        };

        // Determine target path based on layout
        let clone_path = match config.directory_layout {
            crate::generated::types::DirectoryLayout::Flat => target_dir.join(&repo_name),
            crate::generated::types::DirectoryLayout::ByTeam => {
                target_dir.join(&group.name).join(&repo_name)
            }
            crate::generated::types::DirectoryLayout::ByTask => {
                target_dir.join(&assignment.name).join(&repo_name)
            }
        };

        if clone_path.exists() {
            skipped_groups.push(SkippedGroup {
                assignment_id: assignment_id.clone(),
                group_id: group.id.clone(),
                group_name: group.name.clone(),
                reason: SkippedGroupReason::RepoExists,
                context: Some(format!(
                    "Directory already exists: {}",
                    clone_path.display()
                )),
            });
            continue;
        }

        // Create parent directory if needed
        if let Some(parent) = clone_path.parent() {
            if !parent.exists() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    failed += 1;
                    errors.push(OperationError {
                        repo_name,
                        message: format!("Failed to create directory: {}", e),
                    });
                    continue;
                }
            }
        }

        // Clone the repo
        let output = std::process::Command::new("git")
            .args([
                "clone",
                &clone_url,
                clone_path.to_str().unwrap_or(&repo_name),
            ])
            .output();

        match output {
            Ok(result) if result.status.success() => {
                succeeded += 1;
            }
            Ok(result) => {
                failed += 1;
                let stderr = String::from_utf8_lossy(&result.stderr);
                errors.push(OperationError {
                    repo_name,
                    message: format!("Git clone failed: {}", stderr),
                });
            }
            Err(e) => {
                failed += 1;
                errors.push(OperationError {
                    repo_name,
                    message: format!("Failed to run git: {}", e),
                });
            }
        }
    }

    Ok(OperationResult {
        succeeded,
        failed,
        skipped_groups,
        errors,
    })
}

/// Delete repos for assignment groups
#[tauri::command]
pub async fn delete_repos(
    profile: String,
    roster: Roster,
    assignment_id: AssignmentId,
    _config: DeleteConfig,
) -> Result<OperationResult, AppError> {
    let (platform, profile_settings) = build_platform_from_profile(&profile)?;

    let assignment = find_assignment(&roster, &assignment_id)
        .ok_or_else(|| AppError::new("Assignment not found"))?;

    let template = &profile_settings.operations.repo_name_template;
    let valid_groups = get_valid_groups(assignment);
    let core_assignment = to_core_assignment(assignment);

    let mut succeeded = 0i64;
    let mut failed = 0i64;
    let mut skipped_groups = Vec::new();
    let mut errors = Vec::new();

    // Skip empty groups
    for group in assignment.groups.iter() {
        if group.member_ids.is_empty() {
            skipped_groups.push(SkippedGroup {
                assignment_id: assignment_id.clone(),
                group_id: group.id.clone(),
                group_name: group.name.clone(),
                reason: SkippedGroupReason::EmptyGroup,
                context: None,
            });
        }
    }

    for group in valid_groups.iter() {
        let core_group = to_core_group(group);
        let repo_name = compute_repo_name(template, &core_assignment, &core_group);

        // Check if repo exists first
        let repo = match platform.get_repo(&repo_name, None).await {
            Ok(r) => r,
            Err(PlatformError::NotFound(_)) => {
                skipped_groups.push(SkippedGroup {
                    assignment_id: assignment_id.clone(),
                    group_id: group.id.clone(),
                    group_name: group.name.clone(),
                    reason: SkippedGroupReason::RepoNotFound,
                    context: Some(repo_name),
                });
                continue;
            }
            Err(e) => {
                failed += 1;
                errors.push(OperationError {
                    repo_name,
                    message: e.to_string(),
                });
                continue;
            }
        };

        match platform.delete_repo(&repo).await {
            Ok(()) => {
                succeeded += 1;
            }
            Err(e) => {
                failed += 1;
                errors.push(OperationError {
                    repo_name,
                    message: e.to_string(),
                });
            }
        }
    }

    Ok(OperationResult {
        succeeded,
        failed,
        skipped_groups,
        errors,
    })
}
