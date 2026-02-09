use anyhow::{anyhow, Result};
use repo_manage_core::roster::{AssignmentId, Roster};
use repo_manage_core::{
    settings::ConfigError, GitConnection, GitIdentityMode, GitServerType, LmsOperationContext,
    RepoOperationContext, SettingsManager,
};
use std::io::{self, Write};

pub fn resolve_profile(arg: Option<String>) -> Result<String> {
    if let Some(name) = arg {
        return Ok(name);
    }
    let manager = SettingsManager::new()?;
    manager.get_active_profile()?.ok_or_else(|| {
        anyhow!("No active profile. Use --profile or run 'redu profile load <name>'")
    })
}

pub fn load_roster(manager: &SettingsManager, profile: &str) -> Result<Roster> {
    let roster = manager
        .load_roster(profile)
        .map_err(|err: ConfigError| anyhow!(err))?;
    roster.ok_or_else(|| {
        anyhow!(
            "No roster for profile '{}'. Import students first.",
            profile
        )
    })
}

pub fn resolve_assignment(roster: &Roster, name: &str) -> Result<AssignmentId> {
    roster
        .assignments
        .iter()
        .find(|assignment| assignment.name == name)
        .map(|assignment| assignment.id.clone())
        .ok_or_else(|| anyhow!("Assignment '{}' not found in roster", name))
}

pub fn load_git_connection(manager: &SettingsManager, profile: &str) -> Result<GitConnection> {
    let profile_settings = manager.load_profile_settings(profile)?;
    let connection_name = profile_settings
        .git_connection
        .ok_or_else(|| anyhow!("No git connection configured for profile"))?;

    let app_settings = manager.load_app_settings()?;
    app_settings
        .git_connections
        .get(&connection_name)
        .cloned()
        .ok_or_else(|| anyhow!("Git connection '{}' not found", connection_name))
}

pub fn load_repo_context(manager: &SettingsManager, profile: &str) -> Result<RepoOperationContext> {
    let profile_settings = manager.load_profile_settings(profile)?;
    let git_connection = load_git_connection(manager, profile)?;

    Ok(RepoOperationContext {
        target_org: profile_settings.operations.target_org.clone(),
        repo_name_template: profile_settings.operations.repo_name_template.clone(),
        git_connection,
    })
}

pub fn load_lms_context(manager: &SettingsManager, profile: &str) -> Result<LmsOperationContext> {
    let profile_settings = manager.load_profile_settings(profile)?;
    let app_settings = manager.load_app_settings()?;
    let connection = app_settings
        .lms_connection
        .ok_or_else(|| anyhow!("No LMS connection configured in app settings"))?;

    Ok(LmsOperationContext {
        connection,
        course_id: profile_settings.course.id.clone(),
    })
}

pub fn resolve_identity_mode(connection: &GitConnection) -> GitIdentityMode {
    match connection.server_type {
        GitServerType::GitLab => connection.identity_mode.unwrap_or_default(),
        GitServerType::GitHub | GitServerType::Gitea => GitIdentityMode::Username,
    }
}

pub fn confirm(prompt: &str) -> Result<bool> {
    print!("{} [y/N]: ", prompt);
    io::stdout().flush()?;
    let mut input = String::new();
    io::stdin().read_line(&mut input)?;
    Ok(input.trim().eq_ignore_ascii_case("y"))
}
