//! Repository setup operation

use crate::{
    create_platform, setup_student_repos as core_setup, PlatformAPI, PlatformError, PlatformParams,
    PlatformType, ProgressEvent, Result, SetupResult, StudentTeam,
};
use std::path::PathBuf;

/// Parameters for repository setup
#[derive(Debug, Clone)]
pub struct SetupParams {
    pub platform_type: Option<PlatformType>,
    pub base_url: String,
    pub access_token: String,
    pub organization: String,
    pub user: String,
    pub template_org: Option<String>,
    pub templates: Vec<String>,
    pub student_teams: Vec<StudentTeam>,
    pub work_dir: PathBuf,
    pub private: bool,
}

/// Set up student repositories from templates
pub async fn setup_repos(
    params: &SetupParams,
    progress: impl Fn(ProgressEvent) + Send,
) -> Result<SetupResult> {
    progress(ProgressEvent::started("Setup repositories"));

    // Build template URLs
    let template_urls: Vec<String> = params
        .templates
        .iter()
        .map(|t| {
            let org = params.template_org.as_ref().unwrap_or(&params.organization);
            format!("{}/{}/{}", params.base_url, org, t)
        })
        .collect();

    // Create platform
    let platform_params = PlatformParams {
        base_url: params.base_url.clone(),
        access_token: params.access_token.clone(),
        organization: params.organization.clone(),
        user: params.user.clone(),
    };

    progress(ProgressEvent::status("Verifying platform settings..."));
    let platform = create_platform(params.platform_type, &platform_params)?;
    platform.verify_settings().await?;
    progress(ProgressEvent::status("✓ Platform verified"));

    // Create work directory
    std::fs::create_dir_all(&params.work_dir)
        .map_err(|e| PlatformError::FileError(format!("Failed to create work directory: {}", e)))?;

    // Run setup
    progress(ProgressEvent::status(format!(
        "Setting up {} repositories for {} teams...",
        params.templates.len(),
        params.student_teams.len()
    )));

    let result = core_setup(
        &template_urls,
        &params.student_teams,
        &platform,
        &params.work_dir,
        params.private,
        Some(&params.access_token),
    )
    .await?;

    let details = format!(
        "Created: {}, Existing: {}, Errors: {}",
        result.successful_repos.len(),
        result.existing_repos.len(),
        result.errors.len()
    );

    progress(ProgressEvent::completed(
        "Setup repositories",
        Some(details),
    ));

    Ok(result)
}
