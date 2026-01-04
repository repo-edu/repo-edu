use crate::error::{PlatformError, Result};
use crate::generated::types::{
    AssignmentCoverage, CoverageExportFormat, CoverageReport, GitIdentityMode,
    StudentMultipleAssignments, StudentSummary,
};
use crate::import::normalize_assignment_name;
use crate::roster::{AssignmentId, Roster, StudentId};
use std::collections::{HashMap, HashSet};
use std::path::Path;

pub fn get_roster_coverage(roster: &Roster) -> CoverageReport {
    let mut student_summary: HashMap<StudentId, StudentSummary> = HashMap::new();
    for student in &roster.students {
        student_summary.insert(
            student.id.clone(),
            StudentSummary {
                id: student.id.clone(),
                name: student.name.clone(),
            },
        );
    }

    let mut student_assignments: HashMap<StudentId, Vec<String>> = HashMap::new();
    let mut assignments = Vec::new();

    for assignment in &roster.assignments {
        let mut member_ids: HashSet<StudentId> = HashSet::new();
        for group in &assignment.groups {
            for member_id in &group.member_ids {
                member_ids.insert(member_id.clone());
            }
        }

        let assignment_name = assignment.name.clone();
        for member_id in &member_ids {
            student_assignments
                .entry(member_id.clone())
                .or_default()
                .push(assignment_name.clone());
        }

        let missing_students = roster
            .students
            .iter()
            .filter(|student| !member_ids.contains(&student.id))
            .filter_map(|student| student_summary.get(&student.id).cloned())
            .collect::<Vec<_>>();

        assignments.push(AssignmentCoverage {
            assignment_id: assignment.id.clone(),
            assignment_name,
            student_count: member_ids.len() as i64,
            missing_students,
        });
    }

    let mut students_in_multiple = Vec::new();
    let mut students_in_none = Vec::new();

    for student in &roster.students {
        match student_assignments.get(&student.id) {
            Some(assignments_list) if assignments_list.len() > 1 => {
                if let Some(summary) = student_summary.get(&student.id) {
                    students_in_multiple.push(StudentMultipleAssignments {
                        student: summary.clone(),
                        assignment_names: assignments_list.clone(),
                    });
                }
            }
            None => {
                if let Some(summary) = student_summary.get(&student.id) {
                    students_in_none.push(summary.clone());
                }
            }
            _ => {}
        }
    }

    CoverageReport {
        total_students: roster.students.len() as i64,
        assignments,
        students_in_multiple,
        students_in_none,
    }
}

pub fn export_roster_coverage(
    report: &CoverageReport,
    path: &Path,
    format: CoverageExportFormat,
) -> Result<()> {
    let rows = coverage_rows(report);
    let mut target_path = path.to_path_buf();
    if target_path.extension().is_none() {
        let extension = match format {
            CoverageExportFormat::Csv => "csv",
            CoverageExportFormat::Xlsx => "xlsx",
        };
        target_path.set_extension(extension);
    }
    match format {
        CoverageExportFormat::Csv => write_csv(&target_path, rows),
        CoverageExportFormat::Xlsx => write_xlsx(&target_path, "Coverage", rows),
    }
}

pub fn export_teams(
    roster: &Roster,
    assignment_id: &AssignmentId,
    identity_mode: GitIdentityMode,
    path: &Path,
) -> Result<()> {
    let assignment = roster
        .assignments
        .iter()
        .find(|assignment| assignment.id == *assignment_id)
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

    let student_map: HashMap<StudentId, &crate::generated::types::Student> = roster
        .students
        .iter()
        .map(|student| (student.id.clone(), student))
        .collect();

    let mut teams = Vec::new();
    for group in &assignment.groups {
        let mut members = Vec::new();
        for member_id in &group.member_ids {
            if let Some(student) = student_map.get(member_id) {
                match identity_mode {
                    GitIdentityMode::Email => {
                        members.push(student.email.clone());
                    }
                    GitIdentityMode::Username => {
                        if let Some(username) = student.git_username.as_ref() {
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
    let custom_headers = collect_custom_headers(roster);
    let mut rows = Vec::new();
    let mut header = vec![
        "name".to_string(),
        "email".to_string(),
        "student_number".to_string(),
        "git_username".to_string(),
    ];
    header.extend(custom_headers.iter().cloned());
    rows.push(header);

    for student in &roster.students {
        let mut row = vec![
            student.name.clone(),
            student.email.clone(),
            student.student_number.clone().unwrap_or_default(),
            student.git_username.clone().unwrap_or_default(),
        ];
        for key in &custom_headers {
            row.push(student.custom_fields.get(key).cloned().unwrap_or_default());
        }
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
        .assignments
        .iter()
        .find(|assignment| assignment.id == *assignment_id)
        .ok_or_else(|| PlatformError::Other("Assignment not found".to_string()))?;

    let mut student_groups: HashMap<StudentId, Vec<String>> = HashMap::new();
    for group in &assignment.groups {
        for member_id in &group.member_ids {
            student_groups
                .entry(member_id.clone())
                .or_default()
                .push(group.name.clone());
        }
    }

    let custom_headers = collect_custom_headers(roster);
    let mut rows = Vec::new();
    let mut header = vec![
        "name".to_string(),
        "email".to_string(),
        "student_number".to_string(),
        "git_username".to_string(),
        "group_name".to_string(),
    ];
    header.extend(custom_headers.iter().cloned());
    rows.push(header);

    for student in &roster.students {
        let groups = match student_groups.get(&student.id) {
            Some(groups) => groups.clone(),
            None => continue,
        };
        let group_name = groups.join(", ");
        let mut row = vec![
            student.name.clone(),
            student.email.clone(),
            student.student_number.clone().unwrap_or_default(),
            student.git_username.clone().unwrap_or_default(),
            group_name,
        ];
        for key in &custom_headers {
            row.push(student.custom_fields.get(key).cloned().unwrap_or_default());
        }
        rows.push(row);
    }

    write_by_extension(path, "Assignment Students", rows)
}

fn collect_custom_headers(roster: &Roster) -> Vec<String> {
    let mut keys: HashSet<String> = HashSet::new();
    for student in &roster.students {
        for key in student.custom_fields.keys() {
            keys.insert(key.clone());
        }
    }
    let mut headers = keys.into_iter().collect::<Vec<_>>();
    headers.sort_by(|a, b| normalize_assignment_name(a).cmp(&normalize_assignment_name(b)));
    headers
}

fn coverage_rows(report: &CoverageReport) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    rows.push(vec![
        "Assignment".to_string(),
        "Student Count".to_string(),
        "Missing Students".to_string(),
    ]);

    for assignment in &report.assignments {
        let missing = assignment
            .missing_students
            .iter()
            .map(|student| student.name.clone())
            .collect::<Vec<_>>()
            .join(", ");
        rows.push(vec![
            assignment.assignment_name.clone(),
            assignment.student_count.to_string(),
            missing,
        ]);
    }

    rows.push(Vec::new());
    rows.push(vec!["Students in multiple assignments".to_string()]);
    rows.push(vec!["Student".to_string(), "Assignments".to_string()]);
    for entry in &report.students_in_multiple {
        rows.push(vec![
            entry.student.name.clone(),
            entry.assignment_names.join(", "),
        ]);
    }

    rows.push(Vec::new());
    rows.push(vec!["Students in no assignment".to_string()]);
    rows.push(vec!["Student".to_string()]);
    for student in &report.students_in_none {
        rows.push(vec![student.name.clone()]);
    }

    rows
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
