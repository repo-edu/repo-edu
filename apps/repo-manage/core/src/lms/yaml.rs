use super::types::*;
use crate::error::*;
use crate::types::StudentTeam;
use std::collections::HashMap;
use std::path::Path;

/// Generate RepoBee-compatible YAML from LMS student information
pub fn generate_repobee_yaml(
    students: &[StudentInfo],
    config: &YamlConfig,
) -> Result<Vec<StudentTeam>> {
    generate_repobee_yaml_with_progress(students, config, |_, _, _| {})
}

/// Generate RepoBee-compatible YAML from LMS student information with progress callback
pub fn generate_repobee_yaml_with_progress<F>(
    students: &[StudentInfo],
    config: &YamlConfig,
    mut progress_callback: F,
) -> Result<Vec<StudentTeam>>
where
    F: FnMut(usize, usize, &str),
{
    // Group students by their LMS group
    let mut group_map: HashMap<String, Vec<&StudentInfo>> = HashMap::new();

    for student in students {
        if let Some(group) = &student.group {
            // Filter by full groups if required
            if config.full_groups {
                if let (Some(count), Some(max)) = (group.members_count, group.max_membership) {
                    if count < max {
                        continue; // Skip non-full groups
                    }
                }
            }

            let group_name = group.name.clone();
            group_map.entry(group_name).or_default().push(student);
        } else if !config.full_groups {
            // Include groupless students if not filtering for full groups
            let group_name = "no-group".to_string();
            group_map.entry(group_name).or_default().push(student);
        }
    }

    // Generate teams
    let mut teams = Vec::new();
    let total_groups = group_map.len();
    let mut processed_groups = 0;
    for (group_name, group_students) in group_map {
        processed_groups += 1;
        progress_callback(processed_groups, total_groups, &group_name);

        let team_name = generate_team_name(&group_name, group_students.as_slice(), config);

        let members: Vec<String> = group_students
            .iter()
            .map(|s| format_member(s, &config.member_option))
            .collect();

        teams.push(StudentTeam {
            name: team_name,
            members,
        });
    }

    // Sort by team name for consistency
    teams.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(teams)
}

/// Generate team name based on configuration
fn generate_team_name(group_name: &str, students: &[&StudentInfo], config: &YamlConfig) -> String {
    let mut parts = Vec::new();

    // Add "team" prefix
    parts.push("team".to_string());

    // Add group name if configured
    if config.include_group {
        parts.push(sanitize_name_part(group_name));
    }

    // Add member names if configured
    if config.include_member && !students.is_empty() {
        let member_names: Vec<String> = students
            .iter()
            .map(|s| {
                if config.include_initials {
                    extract_initials(&s.name, &s.full_name)
                } else {
                    sanitize_name_part(&s.name)
                }
            })
            .collect();

        parts.extend(member_names);
    }

    parts.join("-")
}

/// Format a member according to the member option
fn format_member(student: &StudentInfo, option: &MemberOption) -> String {
    match option {
        MemberOption::Both => format!("({}, {})", student.email, student.git_id),
        MemberOption::Email => student.email.clone(),
        MemberOption::GitId => student.git_id.clone(),
    }
}

/// Extract initials from name (e.g., "john doe" -> "jd")
fn extract_initials(name: &str, full_name: &str) -> String {
    // Try to extract from full name if available
    if !full_name.is_empty() {
        let parts: Vec<&str> = full_name.split_whitespace().collect();
        if parts.len() >= 2 {
            let first_initial = parts[0].chars().next().unwrap_or('x');
            let last_initial = parts[parts.len() - 1].chars().next().unwrap_or('x');
            return format!("{}{}", first_initial, last_initial).to_lowercase();
        }
    }

    // Fallback to using name
    name.chars().take(2).collect::<String>().to_lowercase()
}

/// Sanitize a name part for use in team names
fn sanitize_name_part(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-')
        .collect()
}

/// Write teams to YAML file
pub fn write_yaml_file(teams: &[StudentTeam], file_path: &Path) -> Result<()> {
    let yaml = serde_yaml::to_string(teams)
        .map_err(|e| PlatformError::Other(format!("Failed to serialize YAML: {}", e)))?;

    std::fs::write(file_path, yaml)
        .map_err(|e| PlatformError::Other(format!("Failed to write YAML file: {}", e)))?;

    Ok(())
}

/// Write students to CSV file
pub fn write_csv_file(students: &[StudentInfo], file_path: &Path) -> Result<()> {
    let mut writer =
        csv::Writer::from_path(file_path).map_err(|e| PlatformError::Other(e.to_string()))?;

    writer
        .write_record(["Group", "FullName", "Name", "ID", "GitID", "Mail"])
        .map_err(|e| PlatformError::Other(format!("Failed to write CSV header: {}", e)))?;

    for student in students {
        let group_name = student
            .group
            .as_ref()
            .map(|g| g.name.clone())
            .unwrap_or_default();

        writer
            .write_record([
                group_name,
                student.full_name.clone(),
                student.name.clone(),
                student.canvas_id.clone(),
                student.git_id.clone(),
                student.email.clone(),
            ])
            .map_err(|e| PlatformError::Other(format!("Failed to write CSV row: {}", e)))?;
    }

    writer
        .flush()
        .map_err(|e| PlatformError::Other(format!("Failed to flush CSV writer: {}", e)))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn write_csv_file_handles_commas_and_quotes() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("students.csv");

        let group = Group {
            id: "1".to_string(),
            name: "Group, \"A\"".to_string(),
            description: None,
            course_id: None,
            members_count: None,
            group_category_id: None,
            is_public: None,
            join_level: None,
            max_membership: None,
        };

        let students = vec![StudentInfo {
            group: Some(group),
            full_name: "Doe, \"Jane\"".to_string(),
            name: "Doe".to_string(),
            canvas_id: "123".to_string(),
            git_id: "jdoe".to_string(),
            email: "jane@example.com".to_string(),
        }];

        write_csv_file(&students, &file_path).unwrap();

        let mut reader = csv::Reader::from_path(&file_path).unwrap();
        let headers = reader.headers().unwrap().clone();
        assert_eq!(
            headers,
            csv::StringRecord::from(vec!["Group", "FullName", "Name", "ID", "GitID", "Mail"])
        );

        let record = reader.records().next().unwrap().unwrap();
        assert_eq!(record.get(0), Some("Group, \"A\""));
        assert_eq!(record.get(1), Some("Doe, \"Jane\""));
        assert_eq!(record.get(2), Some("Doe"));
        assert_eq!(record.get(3), Some("123"));
        assert_eq!(record.get(4), Some("jdoe"));
        assert_eq!(record.get(5), Some("jane@example.com"));
    }
}
