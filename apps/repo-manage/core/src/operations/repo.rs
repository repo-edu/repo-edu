use crate::platform::{Platform, PlatformAPI};
use crate::roster::{
    active_member_ids, compute_repo_name, resolve_assignment_groups, Assignment, AssignmentId,
    Group, Roster,
};
use crate::{
    CloneConfig, CreateConfig, DeleteConfig, DirectoryLayout, GitConnection, GitServerType,
    OperationError, OperationResult, RepoCollision, RepoCollisionKind, RepoOperationContext,
    RepoPreflightResult, SkippedGroup, SkippedGroupReason,
};
use std::path::PathBuf;

use super::error::HandlerError;
use crate::ProgressEvent;

fn build_platform_from_context(context: &RepoOperationContext) -> Result<Platform, HandlerError> {
    let connection: &GitConnection = &context.git_connection;
    let base_url = match connection.server_type {
        GitServerType::GitHub => connection
            .connection
            .base_url
            .clone()
            .unwrap_or_else(|| "https://github.com".to_string()),
        GitServerType::GitLab | GitServerType::Gitea => {
            connection.connection.base_url.clone().ok_or_else(|| {
                HandlerError::Validation("Git connection base URL is required".into())
            })?
        }
    };

    let target_org = context.target_org.clone();
    let user = connection.connection.user.clone();
    let token = connection.connection.access_token.clone();

    let platform = match connection.server_type {
        GitServerType::GitHub => Platform::github(base_url, token, target_org, user)?,
        GitServerType::GitLab => Platform::gitlab(base_url, token, target_org, user)?,
        GitServerType::Gitea => Platform::gitea(base_url, token, target_org, user)?,
    };

    Ok(platform)
}

fn find_assignment<'a>(
    roster: &'a Roster,
    assignment_id: &AssignmentId,
) -> Result<&'a Assignment, HandlerError> {
    roster
        .assignments
        .iter()
        .find(|a| a.id == *assignment_id)
        .ok_or_else(|| HandlerError::not_found("Assignment not found"))
}

fn get_resolved_groups<'a>(
    roster: &'a Roster,
    assignment: &Assignment,
) -> (Vec<&'a Group>, Vec<&'a Group>) {
    let all_groups = resolve_assignment_groups(roster, assignment);
    let valid = all_groups
        .iter()
        .copied()
        .filter(|g| !active_member_ids(roster, g).is_empty())
        .collect();
    let empty = all_groups
        .iter()
        .copied()
        .filter(|g| active_member_ids(roster, g).is_empty())
        .collect();
    (valid, empty)
}

pub struct CreateReposParams {
    pub context: RepoOperationContext,
    pub roster: Roster,
    pub assignment_id: AssignmentId,
    pub config: CreateConfig,
}

pub struct CloneReposParams {
    pub context: RepoOperationContext,
    pub roster: Roster,
    pub assignment_id: AssignmentId,
    pub config: CloneConfig,
}

pub struct DeleteReposParams {
    pub context: RepoOperationContext,
    pub roster: Roster,
    pub assignment_id: AssignmentId,
    pub config: DeleteConfig,
}

pub async fn preflight_create(
    context: &RepoOperationContext,
    roster: &Roster,
    assignment_id: &AssignmentId,
    _config: &CreateConfig,
) -> Result<RepoPreflightResult, HandlerError> {
    let platform = build_platform_from_context(context)?;
    let assignment = find_assignment(roster, assignment_id)?;

    let template = &context.repo_name_template;
    let (valid_groups, _) = get_resolved_groups(roster, assignment);

    let mut collisions = Vec::new();

    for group in &valid_groups {
        let repo_name = compute_repo_name(template, assignment, group);
        match platform.get_repo(&repo_name, None).await {
            Ok(_) => collisions.push(RepoCollision {
                group_id: group.id.clone(),
                group_name: group.name.clone(),
                repo_name,
                kind: RepoCollisionKind::AlreadyExists,
            }),
            Err(crate::PlatformError::NotFound(_)) => {}
            Err(e) => return Err(e.into()),
        }
    }

    let ready_count = valid_groups.len().saturating_sub(collisions.len()) as i64;

    Ok(RepoPreflightResult {
        collisions,
        ready_count,
    })
}

pub async fn preflight_clone(
    context: &RepoOperationContext,
    roster: &Roster,
    assignment_id: &AssignmentId,
    _config: &CloneConfig,
) -> Result<RepoPreflightResult, HandlerError> {
    let platform = build_platform_from_context(context)?;
    let assignment = find_assignment(roster, assignment_id)?;

    let template = &context.repo_name_template;
    let (valid_groups, _) = get_resolved_groups(roster, assignment);

    let mut collisions = Vec::new();

    for group in &valid_groups {
        let repo_name = compute_repo_name(template, assignment, group);
        match platform.get_repo(&repo_name, None).await {
            Ok(_) => {}
            Err(crate::PlatformError::NotFound(_)) => collisions.push(RepoCollision {
                group_id: group.id.clone(),
                group_name: group.name.clone(),
                repo_name,
                kind: RepoCollisionKind::NotFound,
            }),
            Err(e) => return Err(e.into()),
        }
    }

    let ready_count = valid_groups.len().saturating_sub(collisions.len()) as i64;

    Ok(RepoPreflightResult {
        collisions,
        ready_count,
    })
}

pub async fn preflight_delete(
    context: &RepoOperationContext,
    roster: &Roster,
    assignment_id: &AssignmentId,
    _config: &DeleteConfig,
) -> Result<RepoPreflightResult, HandlerError> {
    let platform = build_platform_from_context(context)?;
    let assignment = find_assignment(roster, assignment_id)?;

    let template = &context.repo_name_template;
    let (valid_groups, _) = get_resolved_groups(roster, assignment);

    let mut collisions = Vec::new();

    for group in &valid_groups {
        let repo_name = compute_repo_name(template, assignment, group);
        match platform.get_repo(&repo_name, None).await {
            Ok(_) => {}
            Err(crate::PlatformError::NotFound(_)) => collisions.push(RepoCollision {
                group_id: group.id.clone(),
                group_name: group.name.clone(),
                repo_name,
                kind: RepoCollisionKind::NotFound,
            }),
            Err(e) => return Err(e.into()),
        }
    }

    let ready_count = valid_groups.len().saturating_sub(collisions.len()) as i64;

    Ok(RepoPreflightResult {
        collisions,
        ready_count,
    })
}

pub async fn create_repos<F>(
    params: CreateReposParams,
    on_progress: F,
) -> Result<OperationResult, HandlerError>
where
    F: Fn(ProgressEvent) + Send + 'static,
{
    on_progress(ProgressEvent::started("Create repos"));

    let platform = build_platform_from_context(&params.context)?;
    let assignment = find_assignment(&params.roster, &params.assignment_id)?;

    let template = &params.context.repo_name_template;
    let (valid_groups, empty_groups) = get_resolved_groups(&params.roster, assignment);

    let mut succeeded = 0i64;
    let mut failed = 0i64;
    let mut skipped_groups = Vec::new();
    let mut errors = Vec::new();

    for group in &empty_groups {
        skipped_groups.push(SkippedGroup {
            assignment_id: params.assignment_id.clone(),
            group_id: group.id.clone(),
            group_name: group.name.clone(),
            reason: SkippedGroupReason::EmptyGroup,
            context: None,
        });
    }

    let total = valid_groups.len().max(1);
    for (idx, group) in valid_groups.iter().enumerate() {
        on_progress(ProgressEvent::progress(
            idx + 1,
            total,
            format!("Creating {}", group.name),
        ));

        let repo_name = compute_repo_name(template, assignment, group);
        match platform.create_repo(&repo_name, "", true, None).await {
            Ok(result) => {
                if result.created {
                    succeeded += 1;
                } else {
                    skipped_groups.push(SkippedGroup {
                        assignment_id: params.assignment_id.clone(),
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

    on_progress(ProgressEvent::completed(
        "Create repos",
        Some(format!("{} succeeded, {} failed", succeeded, failed)),
    ));

    Ok(OperationResult {
        succeeded,
        failed,
        skipped_groups,
        errors,
    })
}

pub async fn clone_repos<F>(
    params: CloneReposParams,
    on_progress: F,
) -> Result<OperationResult, HandlerError>
where
    F: Fn(ProgressEvent) + Send + 'static,
{
    on_progress(ProgressEvent::started("Clone repos"));

    let platform = build_platform_from_context(&params.context)?;
    let assignment = find_assignment(&params.roster, &params.assignment_id)?;

    let template = &params.context.repo_name_template;
    let (valid_groups, empty_groups) = get_resolved_groups(&params.roster, assignment);

    let target_dir = PathBuf::from(&params.config.target_dir);
    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir)?;
    }

    let mut succeeded = 0i64;
    let mut failed = 0i64;
    let mut skipped_groups = Vec::new();
    let mut errors = Vec::new();

    for group in &empty_groups {
        skipped_groups.push(SkippedGroup {
            assignment_id: params.assignment_id.clone(),
            group_id: group.id.clone(),
            group_name: group.name.clone(),
            reason: SkippedGroupReason::EmptyGroup,
            context: None,
        });
    }

    let total = valid_groups.len().max(1);
    for (idx, group) in valid_groups.iter().enumerate() {
        on_progress(ProgressEvent::progress(
            idx + 1,
            total,
            format!("Cloning {}", group.name),
        ));

        let repo_name = compute_repo_name(template, assignment, group);
        let repo = match platform.get_repo(&repo_name, None).await {
            Ok(r) => r,
            Err(crate::PlatformError::NotFound(_)) => {
                skipped_groups.push(SkippedGroup {
                    assignment_id: params.assignment_id.clone(),
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

        let clone_path = match params.config.directory_layout {
            DirectoryLayout::Flat => target_dir.join(&repo_name),
            DirectoryLayout::ByTeam => target_dir.join(&group.name).join(&repo_name),
            DirectoryLayout::ByTask => target_dir.join(&assignment.name).join(&repo_name),
        };

        if clone_path.exists() {
            skipped_groups.push(SkippedGroup {
                assignment_id: params.assignment_id.clone(),
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

        if let Some(parent) = clone_path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)?;
            }
        }

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

    on_progress(ProgressEvent::completed(
        "Clone repos",
        Some(format!("{} succeeded, {} failed", succeeded, failed)),
    ));

    Ok(OperationResult {
        succeeded,
        failed,
        skipped_groups,
        errors,
    })
}

pub async fn delete_repos<F>(
    params: DeleteReposParams,
    on_progress: F,
) -> Result<OperationResult, HandlerError>
where
    F: Fn(ProgressEvent) + Send + 'static,
{
    on_progress(ProgressEvent::started("Delete repos"));

    let platform = build_platform_from_context(&params.context)?;
    let assignment = find_assignment(&params.roster, &params.assignment_id)?;

    let template = &params.context.repo_name_template;
    let (valid_groups, empty_groups) = get_resolved_groups(&params.roster, assignment);

    let mut succeeded = 0i64;
    let mut failed = 0i64;
    let mut skipped_groups = Vec::new();
    let mut errors = Vec::new();

    for group in &empty_groups {
        skipped_groups.push(SkippedGroup {
            assignment_id: params.assignment_id.clone(),
            group_id: group.id.clone(),
            group_name: group.name.clone(),
            reason: SkippedGroupReason::EmptyGroup,
            context: None,
        });
    }

    let total = valid_groups.len().max(1);
    for (idx, group) in valid_groups.iter().enumerate() {
        on_progress(ProgressEvent::progress(
            idx + 1,
            total,
            format!("Deleting {}", group.name),
        ));

        let repo_name = compute_repo_name(template, assignment, group);
        let repo = match platform.get_repo(&repo_name, None).await {
            Ok(r) => r,
            Err(crate::PlatformError::NotFound(_)) => {
                skipped_groups.push(SkippedGroup {
                    assignment_id: params.assignment_id.clone(),
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

    on_progress(ProgressEvent::completed(
        "Delete repos",
        Some(format!("{} succeeded, {} failed", succeeded, failed)),
    ));

    Ok(OperationResult {
        succeeded,
        failed,
        skipped_groups,
        errors,
    })
}
