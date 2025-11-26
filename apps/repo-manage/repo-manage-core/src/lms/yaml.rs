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
            group_map
                .entry(group_name)
                .or_insert_with(Vec::new)
                .push(student);
        } else if !config.full_groups {
            // Include groupless students if not filtering for full groups
            let group_name = "no-group".to_string();
            group_map
                .entry(group_name)
                .or_insert_with(Vec::new)
                .push(student);
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
    use std::io::Write;

    let mut file = std::fs::File::create(file_path)
        .map_err(|e| PlatformError::Other(format!("Failed to create CSV file: {}", e)))?;

    // Write header
    writeln!(file, "Group,FullName,Name,ID,GitID,Mail")
        .map_err(|e| PlatformError::Other(format!("Failed to write CSV header: {}", e)))?;

    // Write rows
    for student in students {
        let group_name = student
            .group
            .as_ref()
            .map(|g| g.name.clone())
            .unwrap_or_default();

        writeln!(
            file,
            "{},{},{},{},{},{}",
            group_name,
            student.full_name,
            student.name,
            student.canvas_id,
            student.git_id,
            student.email
        )
        .map_err(|e| PlatformError::Other(format!("Failed to write CSV row: {}", e)))?;
    }

    Ok(())
}
