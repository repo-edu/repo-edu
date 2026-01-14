use crate::error::AppError;
use repo_manage_core::import::{normalize_email, parse_git_usernames_csv};
use repo_manage_core::platform::{PlatformParams, PlatformType, UsernameCheck};
use repo_manage_core::roster::{
    export_assignment_students as core_export_assignment_students,
    export_groups_for_edit as core_export_groups_for_edit,
    export_roster_coverage as core_export_roster_coverage, export_students as core_export_students,
    export_teams as core_export_teams, get_roster_coverage as core_get_roster_coverage,
    import_groups_from_file as core_import_groups_from_file, AffectedGroup, AssignmentId,
    GitIdentityMode, GitUsernameStatus, Roster, StudentId, StudentRemovalCheck,
};
use repo_manage_core::{
    create_platform, AppSettings, CoverageExportFormat, CoverageReport, GitConnection,
    GitServerType, GroupFileImportResult, ImportGitUsernamesResult, InvalidUsername,
    SettingsManager, UsernameInvalidReason, UsernameVerificationError, UsernameVerificationResult,
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

/// Check whether a student removal impacts any groups
#[tauri::command]
pub async fn check_student_removal(
    profile: String,
    roster: Roster,
    student_id: StudentId,
) -> Result<StudentRemovalCheck, AppError> {
    let _ = profile;
    let student = roster
        .students
        .iter()
        .find(|student| student.id == student_id)
        .ok_or_else(|| AppError::new(format!("Student '{}' not found", student_id)))?;

    let mut affected_groups = Vec::new();
    for assignment in &roster.assignments {
        for group in &assignment.groups {
            if group.member_ids.iter().any(|id| id == &student_id) {
                affected_groups.push(AffectedGroup {
                    assignment_id: assignment.id.clone(),
                    assignment_name: assignment.name.clone(),
                    group_id: group.id.clone(),
                    group_name: group.name.clone(),
                });
            }
        }
    }

    Ok(StudentRemovalCheck {
        student_id,
        student_name: student.name.clone(),
        affected_groups,
    })
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
    for (idx, student) in updated_roster.students.iter().enumerate() {
        email_index.insert(normalize_email(&student.email), idx);
    }

    let mut matched = 0;
    let mut unmatched_emails = Vec::new();

    for entry in entries {
        if let Some(&idx) = email_index.get(&entry.email) {
            let student = &mut updated_roster.students[idx];
            if student.git_username.as_deref() != Some(entry.git_username.as_str()) {
                student.git_username = Some(entry.git_username);
                student.git_username_status = GitUsernameStatus::Unknown;
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

    for student in &mut updated_roster.students {
        let username = match student.git_username.as_ref().map(|u| u.trim()) {
            Some(value) if !value.is_empty() => value,
            _ => continue,
        };

        if scope == UsernameVerificationScope::UnknownOnly
            && student.git_username_status != GitUsernameStatus::Unknown
        {
            continue;
        }

        match platform.check_username(username).await {
            Ok(UsernameCheck::Found) => {
                student.git_username_status = GitUsernameStatus::Valid;
                valid += 1;
            }
            Ok(UsernameCheck::NotFound) => {
                student.git_username_status = GitUsernameStatus::Invalid;
                invalid.push(InvalidUsername {
                    student_email: student.email.clone(),
                    student_name: student.name.clone(),
                    git_username: username.to_string(),
                    reason: UsernameInvalidReason::NotFound,
                });
            }
            Ok(UsernameCheck::Blocked) => {
                student.git_username_status = GitUsernameStatus::Invalid;
                invalid.push(InvalidUsername {
                    student_email: student.email.clone(),
                    student_name: student.name.clone(),
                    git_username: username.to_string(),
                    reason: UsernameInvalidReason::Blocked,
                });
            }
            Err(error) => {
                student.git_username_status = GitUsernameStatus::Unknown;
                errors.push(UsernameVerificationError {
                    student_email: student.email.clone(),
                    student_name: student.name.clone(),
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
pub async fn import_groups_from_file(
    roster: Roster,
    assignment_id: AssignmentId,
    file_path: PathBuf,
) -> Result<GroupFileImportResult, AppError> {
    if !file_path.exists() {
        return Err(AppError::new("Import file not found"));
    }
    Ok(core_import_groups_from_file(
        roster,
        &assignment_id,
        &file_path,
    )?)
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

#[tauri::command]
pub async fn get_roster_coverage(roster: Roster) -> Result<CoverageReport, AppError> {
    Ok(core_get_roster_coverage(&roster))
}

#[tauri::command]
pub async fn export_roster_coverage(
    roster: Roster,
    path: PathBuf,
    format: CoverageExportFormat,
) -> Result<(), AppError> {
    let report = core_get_roster_coverage(&roster);
    core_export_roster_coverage(&report, &path, format)?;
    Ok(())
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
