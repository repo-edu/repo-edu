use crate::error::AppError;
use repo_manage_core::import::{
    normalize_email, normalize_group_name as core_normalize_group_name, parse_git_usernames_csv,
};
use repo_manage_core::operations;
use repo_manage_core::platform::{PlatformParams, PlatformType, UsernameCheck};
use repo_manage_core::roster::{
    ensure_system_group_sets as core_ensure_system_group_sets,
    export_assignment_students as core_export_assignment_students,
    export_groups_for_edit as core_export_groups_for_edit, export_students as core_export_students,
    export_teams as core_export_teams, filter_by_pattern as core_filter_by_pattern,
    preview_group_selection as core_preview, AssignmentId, GitIdentityMode, GitUsernameStatus,
    Roster,
};
use repo_manage_core::{
    create_platform, AppSettings, GitConnection, GitServerType, GroupSelectionMode,
    GroupSelectionPreview, GroupSetImportPreview, GroupSetImportResult, ImportGitUsernamesResult,
    InvalidUsername, PatternFilterResult, SettingsManager, SystemGroupSetEnsureResult,
    UsernameInvalidReason, UsernameVerificationError, UsernameVerificationResult,
    UsernameVerificationScope, VerifyGitUsernamesResult,
};
use std::collections::HashMap;
use std::path::PathBuf;

/// Load roster by profile name
#[tauri::command]
pub async fn get_roster(profile: String) -> Result<Option<Roster>, AppError> {
    let manager = SettingsManager::new()?;
    Ok(manager.load_roster(&profile)?)
}

/// Clear roster data for a profile
#[tauri::command]
pub async fn clear_roster(profile: String) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    manager.clear_roster(&profile)?;
    Ok(())
}

#[tauri::command]
pub async fn import_git_usernames(
    profile: String,
    roster: Roster,
    csv_path: PathBuf,
) -> Result<ImportGitUsernamesResult, AppError> {
    let _ = profile;
    let file =
        std::fs::File::open(&csv_path).map_err(|_| AppError::new("Failed to read CSV file"))?;
    let entries = parse_git_usernames_csv(file)?;

    let mut updated_roster = roster.clone();
    let mut email_index: HashMap<String, usize> = HashMap::new();
    for (idx, member) in updated_roster.students.iter().enumerate() {
        email_index.insert(normalize_email(&member.email), idx);
    }

    let mut matched = 0;
    let mut unmatched_emails = Vec::new();

    for entry in entries {
        if let Some(&idx) = email_index.get(&entry.email) {
            let member = &mut updated_roster.students[idx];
            if member.git_username.as_deref() != Some(entry.git_username.as_str()) {
                member.git_username = Some(entry.git_username);
                member.git_username_status = GitUsernameStatus::Unknown;
            }
            matched += 1;
        } else {
            unmatched_emails.push(entry.email);
        }
    }

    Ok(ImportGitUsernamesResult {
        summary: repo_manage_core::GitUsernameImportSummary {
            matched: matched as i64,
            unmatched_emails,
        },
        roster: updated_roster,
    })
}

#[tauri::command]
pub async fn verify_git_usernames(
    profile: String,
    roster: Roster,
    scope: UsernameVerificationScope,
) -> Result<VerifyGitUsernamesResult, AppError> {
    let manager = SettingsManager::new()?;
    let app_settings = manager.load_app_settings()?;
    let profile_settings = manager.load_profile_settings(&profile)?;
    let git_connection = resolve_git_connection(&profile_settings.git_connection, &app_settings)?;
    let base_url = resolve_base_url(&git_connection)?;
    let platform_type = match git_connection.server_type {
        GitServerType::GitHub => PlatformType::GitHub,
        GitServerType::GitLab => PlatformType::GitLab,
        GitServerType::Gitea => PlatformType::Gitea,
    };

    let params = PlatformParams {
        base_url,
        access_token: git_connection.connection.access_token.clone(),
        organization: profile_settings.operations.target_org.clone(),
        user: git_connection.connection.user.clone(),
    };
    let platform = create_platform(Some(platform_type), &params)?;

    let mut updated_roster = roster.clone();
    let mut valid = 0;
    let mut invalid = Vec::new();
    let mut errors = Vec::new();

    for member in &mut updated_roster.students {
        let username = match member.git_username.as_ref().map(|u| u.trim()) {
            Some(value) if !value.is_empty() => value,
            _ => continue,
        };

        if scope == UsernameVerificationScope::UnknownOnly
            && member.git_username_status != GitUsernameStatus::Unknown
        {
            continue;
        }

        match platform.check_username(username).await {
            Ok(UsernameCheck::Found) => {
                member.git_username_status = GitUsernameStatus::Valid;
                valid += 1;
            }
            Ok(UsernameCheck::NotFound) => {
                member.git_username_status = GitUsernameStatus::Invalid;
                invalid.push(InvalidUsername {
                    student_email: member.email.clone(),
                    student_name: member.name.clone(),
                    git_username: username.to_string(),
                    reason: UsernameInvalidReason::NotFound,
                });
            }
            Ok(UsernameCheck::Blocked) => {
                member.git_username_status = GitUsernameStatus::Invalid;
                invalid.push(InvalidUsername {
                    student_email: member.email.clone(),
                    student_name: member.name.clone(),
                    git_username: username.to_string(),
                    reason: UsernameInvalidReason::Blocked,
                });
            }
            Err(error) => {
                member.git_username_status = GitUsernameStatus::Unknown;
                errors.push(UsernameVerificationError {
                    student_email: member.email.clone(),
                    student_name: member.name.clone(),
                    git_username: username.to_string(),
                    message: error.to_string(),
                });
            }
        }
    }

    Ok(VerifyGitUsernamesResult {
        verification: UsernameVerificationResult {
            valid: valid as i64,
            invalid,
            errors,
        },
        roster: updated_roster,
    })
}

#[tauri::command]
pub async fn export_teams(
    profile: String,
    roster: Roster,
    assignment_id: AssignmentId,
    path: PathBuf,
) -> Result<(), AppError> {
    let manager = SettingsManager::new()?;
    let app_settings = manager.load_app_settings()?;
    let profile_settings = manager.load_profile_settings(&profile)?;
    let identity_mode = resolve_identity_mode(&profile_settings.git_connection, &app_settings)?;
    core_export_teams(&roster, &assignment_id, identity_mode, &path)?;
    Ok(())
}

#[tauri::command]
pub async fn export_groups_for_edit(
    roster: Roster,
    assignment_id: AssignmentId,
    path: PathBuf,
) -> Result<(), AppError> {
    core_export_groups_for_edit(&roster, &assignment_id, &path)?;
    Ok(())
}

#[tauri::command]
pub async fn export_students(roster: Roster, path: PathBuf) -> Result<(), AppError> {
    core_export_students(&roster, &path)?;
    Ok(())
}

#[tauri::command]
pub async fn export_assignment_students(
    roster: Roster,
    assignment_id: AssignmentId,
    path: PathBuf,
) -> Result<(), AppError> {
    core_export_assignment_students(&roster, &assignment_id, &path)?;
    Ok(())
}

/// Create/repair system group sets and normalize group memberships
#[tauri::command]
pub async fn ensure_system_group_sets(
    roster: Roster,
) -> Result<SystemGroupSetEnsureResult, AppError> {
    let mut roster = roster;
    Ok(core_ensure_system_group_sets(&mut roster))
}

/// Normalize a group name using backend slug rules
#[tauri::command]
pub async fn normalize_group_name(name: String) -> Result<String, AppError> {
    Ok(core_normalize_group_name(&name))
}

/// Validate glob and resolve group IDs for assignment preview
#[tauri::command]
pub async fn preview_group_selection(
    roster: Roster,
    group_set_id: String,
    group_selection: GroupSelectionMode,
) -> Result<GroupSelectionPreview, AppError> {
    Ok(core_preview(&roster, &group_set_id, &group_selection))
}

/// Validate glob and return matched value indexes for UI filtering
#[tauri::command]
pub async fn filter_by_pattern(
    pattern: String,
    values: Vec<String>,
) -> Result<PatternFilterResult, AppError> {
    let refs: Vec<&str> = values.iter().map(|s| s.as_str()).collect();
    Ok(core_filter_by_pattern(&pattern, &refs))
}

/// Parse CSV for import preview (no persistence)
#[tauri::command]
pub async fn preview_import_group_set(
    roster: Roster,
    file_path: PathBuf,
) -> Result<GroupSetImportPreview, AppError> {
    operations::preview_import_group_set(&roster, &file_path).map_err(Into::into)
}

/// Parse CSV and create new group set
#[tauri::command]
pub async fn import_group_set(
    roster: Roster,
    file_path: PathBuf,
) -> Result<GroupSetImportResult, AppError> {
    operations::import_group_set(&roster, &file_path).map_err(Into::into)
}

/// Re-parse CSV for reimport preview (no persistence)
#[tauri::command]
pub async fn preview_reimport_group_set(
    roster: Roster,
    group_set_id: String,
    file_path: PathBuf,
) -> Result<GroupSetImportPreview, AppError> {
    operations::preview_reimport_group_set(&roster, &group_set_id, &file_path).map_err(Into::into)
}

/// Re-parse CSV and update existing group set
#[tauri::command]
pub async fn reimport_group_set(
    roster: Roster,
    group_set_id: String,
    file_path: PathBuf,
) -> Result<GroupSetImportResult, AppError> {
    operations::reimport_group_set(&roster, &group_set_id, &file_path).map_err(Into::into)
}

/// Export group set to CSV file
#[tauri::command]
pub async fn export_group_set(
    roster: Roster,
    group_set_id: String,
    file_path: PathBuf,
) -> Result<String, AppError> {
    operations::export_group_set(&roster, &group_set_id, &file_path).map_err(Into::into)
}

fn resolve_git_connection(
    name: &Option<String>,
    app_settings: &AppSettings,
) -> Result<GitConnection, AppError> {
    let name = name
        .as_ref()
        .ok_or_else(|| AppError::new("No git connection selected"))?;
    app_settings
        .git_connections
        .get(name)
        .cloned()
        .ok_or_else(|| AppError::new("Git connection not found"))
}

fn resolve_base_url(connection: &GitConnection) -> Result<String, AppError> {
    match connection.server_type {
        GitServerType::GitHub => Ok(connection
            .connection
            .base_url
            .clone()
            .unwrap_or_else(|| "https://github.com".to_string())),
        GitServerType::GitLab | GitServerType::Gitea => connection
            .connection
            .base_url
            .clone()
            .ok_or_else(|| AppError::new("Git connection base URL is required")),
    }
}

fn resolve_identity_mode(
    name: &Option<String>,
    app_settings: &AppSettings,
) -> Result<GitIdentityMode, AppError> {
    let connection = resolve_git_connection(name, app_settings)?;
    Ok(match connection.server_type {
        GitServerType::GitLab => connection
            .identity_mode
            .unwrap_or(GitIdentityMode::Username),
        _ => GitIdentityMode::Username,
    })
}
