use crate::error::AppError;
use repo_manage_core::operations::{self, CloneReposParams, CreateReposParams, DeleteReposParams};
use repo_manage_core::roster::{AssignmentId, Roster};
use repo_manage_core::{
    CloneConfig, CreateConfig, DeleteConfig, GitConnection, GitVerifyResult, OperationResult,
    RepoOperationContext, RepoPreflightResult, SettingsManager,
};

#[tauri::command]
pub async fn verify_git_connection(name: String) -> Result<GitVerifyResult, AppError> {
    let manager = SettingsManager::new()?;
    let settings = manager.load_app_settings()?;
    let connection = settings
        .git_connections
        .get(&name)
        .cloned()
        .ok_or_else(|| AppError::new("Git connection not found"))?;
    operations::verify_connection(&connection)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn verify_git_connection_draft(
    connection: GitConnection,
) -> Result<GitVerifyResult, AppError> {
    operations::verify_connection(&connection)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn preflight_create_repos(
    context: RepoOperationContext,
    roster: Roster,
    assignment_id: AssignmentId,
    config: CreateConfig,
) -> Result<RepoPreflightResult, AppError> {
    operations::preflight_create(&context, &roster, &assignment_id, &config)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn preflight_clone_repos(
    context: RepoOperationContext,
    roster: Roster,
    assignment_id: AssignmentId,
    config: CloneConfig,
) -> Result<RepoPreflightResult, AppError> {
    operations::preflight_clone(&context, &roster, &assignment_id, &config)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn preflight_delete_repos(
    context: RepoOperationContext,
    roster: Roster,
    assignment_id: AssignmentId,
    config: DeleteConfig,
) -> Result<RepoPreflightResult, AppError> {
    operations::preflight_delete(&context, &roster, &assignment_id, &config)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn create_repos(
    context: RepoOperationContext,
    roster: Roster,
    assignment_id: AssignmentId,
    config: CreateConfig,
) -> Result<OperationResult, AppError> {
    let params = CreateReposParams {
        context,
        roster,
        assignment_id,
        config,
    };
    operations::create_repos(params, |_| {})
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn clone_repos_from_roster(
    context: RepoOperationContext,
    roster: Roster,
    assignment_id: AssignmentId,
    config: CloneConfig,
) -> Result<OperationResult, AppError> {
    let params = CloneReposParams {
        context,
        roster,
        assignment_id,
        config,
    };
    operations::clone_repos(params, |_| {})
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn delete_repos(
    context: RepoOperationContext,
    roster: Roster,
    assignment_id: AssignmentId,
    config: DeleteConfig,
) -> Result<OperationResult, AppError> {
    let params = DeleteReposParams {
        context,
        roster,
        assignment_id,
        config,
    };
    operations::delete_repos(params, |_| {})
        .await
        .map_err(Into::into)
}
