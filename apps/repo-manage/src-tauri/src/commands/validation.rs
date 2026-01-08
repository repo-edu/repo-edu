use crate::error::AppError;
use repo_manage_core::operations;
use repo_manage_core::roster::{AssignmentId, Roster, ValidationResult};
use repo_manage_core::GitIdentityMode;

/// Validate roster (students)
#[tauri::command]
pub async fn validate_roster(roster: Roster) -> Result<ValidationResult, AppError> {
    operations::validate_roster(&roster).map_err(Into::into)
}

/// Validate assignment groups within a roster
#[tauri::command]
pub async fn validate_assignment(
    identity_mode: GitIdentityMode,
    roster: Roster,
    assignment_id: AssignmentId,
) -> Result<ValidationResult, AppError> {
    operations::validate_assignment(&roster, &assignment_id, identity_mode).map_err(Into::into)
}
