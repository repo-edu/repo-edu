use crate::error::AppError;
use repo_manage_core::roster::{AffectedGroup, Roster, StudentId, StudentRemovalCheck};
use repo_manage_core::SettingsManager;

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
        .ok_or_else(|| AppError::new(format!("Student '{}' not found", student_id.to_string())))?;

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
