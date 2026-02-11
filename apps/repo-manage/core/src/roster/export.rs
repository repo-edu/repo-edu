use crate::error::{PlatformError, Result};
use crate::generated::types::GitIdentityMode;
use crate::roster::resolution::resolve_assignment_groups;
use crate::roster::{AssignmentId, EnrollmentType, MemberStatus, Roster, RosterMemberId};
use std::collections::HashMap;
use std::path::Path;

pub fn export_teams(
    roster: &Roster,
    assignment_id: &AssignmentId,
    identity_mode: GitIdentityMode,
    path: &Path,
) -> Result<()> {
    let assignment = roster
        .find_assignment(assignment_id)
        .ok_or_else(|| PlatformError::Other("Assignment not found".to_string()))?;

    #[derive(serde::Serialize)]
    struct TeamEntry {
        name: String,
        members: Vec<String>,
    }

    #[derive(serde::Serialize)]
    struct TeamsExport {
        assignment: String,
        teams: Vec<TeamEntry>,
    }

    let member_map: HashMap<&str, &crate::generated::types::RosterMember> = roster
        .students
        .iter()
        .chain(roster.staff.iter())
        .map(|member| (member.id.as_str(), member))
        .collect();

    let groups = resolve_assignment_groups(roster, assignment);
    let mut teams = Vec::new();
    for group in &groups {
        let mut members = Vec::new();
        for member_id in &group.member_ids {
            if let Some(member) = member_map.get(member_id.as_str()) {
                match identity_mode {
                    GitIdentityMode::Email => {
                        members.push(member.email.clone());
                    }
                    GitIdentityMode::Username => {
                        if let Some(username) = member.git_username.as_ref() {
                            if !username.trim().is_empty() {
                                members.push(username.clone());
                            }
                        }
                    }
                }
            }
        }
        teams.push(TeamEntry {
            name: group.name.clone(),
            members,
        });
    }

    let export = TeamsExport {
        assignment: assignment.name.clone(),
        teams,
    };

    let yaml = serde_yaml::to_string(&export)
        .map_err(|e| PlatformError::Other(format!("Failed to serialize YAML: {}", e)))?;
    std::fs::write(path, yaml)
        .map_err(|e| PlatformError::Other(format!("Failed to write YAML: {}", e)))?;
    Ok(())
}

pub fn export_students(roster: &Roster, path: &Path) -> Result<()> {
    let mut rows = Vec::new();
    let header = vec![
        "id".to_string(),
        "name".to_string(),
        "email".to_string(),
        "student_number".to_string(),
        "git_username".to_string(),
        "status".to_string(),
        "enrollment_type".to_string(),
        "department".to_string(),
        "institution".to_string(),
        "source".to_string(),
    ];
    rows.push(header);

    for member in &roster.students {
        let row = vec![
            member.id.as_str().to_string(),
            member.name.clone(),
            member.email.clone(),
            member.student_number.clone().unwrap_or_default(),
            member.git_username.clone().unwrap_or_default(),
            format_member_status(member.status),
            format_enrollment_type(member.enrollment_type),
            member.department.clone().unwrap_or_default(),
            member.institution.clone().unwrap_or_default(),
            member.source.clone(),
        ];
        rows.push(row);
    }

    write_by_extension(path, "Students", rows)
}

pub fn export_assignment_students(
    roster: &Roster,
    assignment_id: &AssignmentId,
    path: &Path,
) -> Result<()> {
    let assignment = roster
        .find_assignment(assignment_id)
        .ok_or_else(|| PlatformError::Other("Assignment not found".to_string()))?;

    let groups = resolve_assignment_groups(roster, assignment);
    let mut member_groups: HashMap<RosterMemberId, Vec<String>> = HashMap::new();
    for group in &groups {
        for member_id in &group.member_ids {
            member_groups
                .entry(member_id.clone())
                .or_default()
                .push(group.name.clone());
        }
    }

    let mut rows = Vec::new();
    let header = vec![
        "name".to_string(),
        "email".to_string(),
        "student_number".to_string(),
        "git_username".to_string(),
        "status".to_string(),
        "group_name".to_string(),
    ];
    rows.push(header);

    for member in &roster.students {
        let groups = match member_groups.get(&member.id) {
            Some(groups) => groups.clone(),
            None => continue,
        };
        let group_name = groups.join(", ");
        let row = vec![
            member.name.clone(),
            member.email.clone(),
            member.student_number.clone().unwrap_or_default(),
            member.git_username.clone().unwrap_or_default(),
            format_member_status(member.status),
            group_name,
        ];
        rows.push(row);
    }

    write_by_extension(path, "Assignment Students", rows)
}

pub fn export_groups_for_edit(
    roster: &Roster,
    assignment_id: &AssignmentId,
    path: &Path,
) -> Result<()> {
    let assignment = roster
        .find_assignment(assignment_id)
        .ok_or_else(|| PlatformError::Other("Assignment not found".to_string()))?;

    let member_map: HashMap<&str, &crate::generated::types::RosterMember> = roster
        .students
        .iter()
        .chain(roster.staff.iter())
        .map(|member| (member.id.as_str(), member))
        .collect();

    let groups = resolve_assignment_groups(roster, assignment);

    let mut rows = Vec::new();
    rows.push(vec![
        "group_id".to_string(),
        "group_name".to_string(),
        "student_id".to_string(),
        "student_email".to_string(),
        "student_name".to_string(),
        "notes".to_string(),
    ]);

    for group in &groups {
        for member_id in &group.member_ids {
            let member = member_map.get(member_id.as_str()).ok_or_else(|| {
                PlatformError::Other(format!("Unknown member ID in group: {}", member_id))
            })?;
            rows.push(vec![
                group.id.clone(),
                group.name.clone(),
                member.id.as_str().to_string(),
                member.email.clone(),
                member.name.clone(),
                String::new(),
            ]);
        }
    }

    write_by_extension(path, "Assignment Groups", rows)
}

fn format_member_status(status: MemberStatus) -> String {
    match status {
        MemberStatus::Active => "active".to_string(),
        MemberStatus::Dropped => "dropped".to_string(),
        MemberStatus::Incomplete => "incomplete".to_string(),
    }
}

fn format_enrollment_type(enrollment_type: EnrollmentType) -> String {
    match enrollment_type {
        EnrollmentType::Student => "student".to_string(),
        EnrollmentType::Teacher => "teacher".to_string(),
        EnrollmentType::Ta => "ta".to_string(),
        EnrollmentType::Designer => "designer".to_string(),
        EnrollmentType::Observer => "observer".to_string(),
        EnrollmentType::Other => "other".to_string(),
    }
}

fn write_by_extension(path: &Path, sheet_name: &str, rows: Vec<Vec<String>>) -> Result<()> {
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "csv" => write_csv(path, rows),
        "xlsx" => write_xlsx(path, sheet_name, rows),
        _ => Err(PlatformError::Other(format!(
            "Unsupported file extension: {}",
            extension
        ))),
    }
}

fn write_csv(path: &Path, rows: Vec<Vec<String>>) -> Result<()> {
    let mut writer =
        csv::Writer::from_path(path).map_err(|e| PlatformError::Other(e.to_string()))?;
    for row in rows {
        writer
            .write_record(row)
            .map_err(|e| PlatformError::Other(format!("Failed to write CSV row: {}", e)))?;
    }
    writer
        .flush()
        .map_err(|e| PlatformError::Other(format!("Failed to flush CSV writer: {}", e)))?;
    Ok(())
}

fn write_xlsx(path: &Path, sheet_name: &str, rows: Vec<Vec<String>>) -> Result<()> {
    let mut book = umya_spreadsheet::new_file();
    let sheet = book
        .get_sheet_by_name_mut("Sheet1")
        .ok_or_else(|| PlatformError::Other("Missing default worksheet".to_string()))?;
    sheet.set_name(sheet_name);

    for (row_index, row) in rows.iter().enumerate() {
        let row_number = (row_index + 1) as u32;
        for (col_index, value) in row.iter().enumerate() {
            let col_number = (col_index + 1) as u32;
            sheet
                .get_cell_mut((col_number, row_number))
                .set_value(value);
        }
    }

    umya_spreadsheet::writer::xlsx::write(&book, path)
        .map_err(|e| PlatformError::Other(format!("Failed to write XLSX file: {}", e)))?;
    Ok(())
}
