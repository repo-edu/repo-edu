//! Legacy LMS helpers for verifying courses and generating roster files.

use crate::lms::{
    create_lms_client_with_params, generate_repobee_yaml_with_progress,
    get_student_info_and_groups_with_progress, write_csv_file, write_yaml_file, FetchProgress,
    Group, MemberOption, YamlConfig,
};
use crate::progress::ProgressEvent;
use crate::{PlatformError, Result};
use lms_common::LmsClient as LmsClientTrait;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

/// Parameters for LMS course verification
#[derive(Debug, Clone)]
pub struct VerifyLmsParams {
    pub lms_type: String, // "Canvas" or "Moodle"
    pub base_url: String,
    pub access_token: String,
    pub course_id: String,
}

/// Result of LMS course verification
#[derive(Debug, Clone)]
pub struct VerifyLmsResult {
    pub course_id: String,
    pub course_name: String,
    pub course_code: Option<String>,
}

/// Parameters for generating student files from LMS
#[derive(Debug, Clone)]
pub struct GenerateLmsFilesParams {
    pub lms_type: String,
    pub base_url: String,
    pub access_token: String,
    pub course_id: String,
    pub output_folder: PathBuf,
    // Output file options
    pub yaml: bool,
    pub yaml_file: String,
    pub csv: bool,
    pub csv_file: String,
    // YAML generation options
    pub member_option: String, // "(email, gitid)", "email", "git_id"
    pub include_group: bool,
    pub include_member: bool,
    pub include_initials: bool,
    pub full_groups: bool,
}

/// Result of generating LMS files
#[derive(Debug, Clone)]
pub struct GenerateLmsFilesResult {
    pub student_count: usize,
    pub group_count: usize,
    pub generated_files: Vec<String>,
    pub diagnostics: Vec<String>,
}

/// Verify LMS course connection and credentials
pub async fn verify_lms_course(
    params: &VerifyLmsParams,
    progress: impl Fn(ProgressEvent) + Send,
) -> Result<VerifyLmsResult> {
    progress(ProgressEvent::Started {
        operation: "Verify LMS course".into(),
    });

    progress(ProgressEvent::Status(format!(
        "Connecting to {} at {}...",
        params.lms_type, params.base_url
    )));

    let client = create_lms_client_with_params(
        &params.lms_type,
        params.base_url.clone(),
        params.access_token.clone(),
        None,
    )?;

    let course = client.get_course(&params.course_id).await?;

    let result = VerifyLmsResult {
        course_id: course.id.to_string(),
        course_name: course.name.clone(),
        course_code: course.course_code.clone(),
    };

    progress(ProgressEvent::Completed {
        operation: "Verify LMS course".into(),
        details: Some(format!("Course: {}", course.name)),
    });

    Ok(result)
}

/// Generate student files (YAML, CSV) from LMS course
pub async fn generate_lms_files(
    params: &GenerateLmsFilesParams,
    progress: impl Fn(ProgressEvent) + Send,
) -> Result<GenerateLmsFilesResult> {
    progress(ProgressEvent::Started {
        operation: "Generate student files".into(),
    });

    if !params.output_folder.exists() {
        return Err(PlatformError::FileError(format!(
            "Output folder does not exist: {}",
            params.output_folder.display()
        )));
    }

    let client = create_lms_client_with_params(
        &params.lms_type,
        params.base_url.clone(),
        params.access_token.clone(),
        None,
    )?;

    progress(ProgressEvent::Status(
        "Fetching students from LMS...".into(),
    ));

    let fetch_result = get_student_info_and_groups_with_progress(
        &client,
        &params.course_id,
        |update| match &update {
            FetchProgress::FetchingUsers => {}
            FetchProgress::FetchingGroups => {}
            FetchProgress::FetchedUsers { count } => {
                progress(ProgressEvent::Status(format!(
                    "Retrieved {} students",
                    count
                )));
            }
            FetchProgress::FetchedGroups { count } => {
                progress(ProgressEvent::Status(format!("Retrieved {} groups", count)));
            }
            FetchProgress::FetchingGroupMembers {
                current,
                total,
                group_name,
            } => {
                progress(ProgressEvent::Progress {
                    current: *current,
                    total: *total,
                    message: format!("Fetching group: {}", group_name),
                });
            }
        },
    )
    .await?;

    let students = fetch_result.students;
    let lms_groups = fetch_result.groups;

    let student_count = students.len();
    progress(ProgressEvent::Status(format!(
        "Fetched {} students. Generating files...",
        student_count
    )));

    let mut generated_files = Vec::new();
    let mut group_count = 0;
    let mut diagnostics = Vec::new();

    let mut group_member_counts: HashMap<String, usize> = HashMap::new();
    for student in &students {
        if let Some(group) = &student.group {
            *group_member_counts.entry(group.id.clone()).or_default() += 1;
        }
    }

    if params.yaml {
        let config = YamlConfig {
            member_option: MemberOption::parse(&params.member_option)?,
            include_group: params.include_group,
            include_member: params.include_member,
            include_initials: params.include_initials,
            full_groups: params.full_groups,
        };

        let mut generated_groups: HashSet<String> = HashSet::new();
        let teams = generate_repobee_yaml_with_progress(&students, &config, |_, _, group_name| {
            generated_groups.insert(group_name.to_string());
        })?;
        group_count = teams.len();

        diagnostics = build_group_diagnostics(
            &lms_groups,
            &group_member_counts,
            &generated_groups,
            params.full_groups,
        );
        let yaml_path = params.output_folder.join(&params.yaml_file);
        write_yaml_file(&teams, &yaml_path)?;
        generated_files.push(format!(
            "YAML: {} ({} groups)",
            yaml_path.display(),
            group_count
        ));
    }

    if params.csv {
        let csv_path = params.output_folder.join(&params.csv_file);
        write_csv_file(&students, &csv_path)?;
        generated_files.push(format!("CSV: {}", csv_path.display()));
    }

    progress(ProgressEvent::Completed {
        operation: "Generate student files".into(),
        details: Some(format!(
            "{} students, {} files generated",
            student_count,
            generated_files.len()
        )),
    });

    Ok(GenerateLmsFilesResult {
        student_count,
        group_count,
        generated_files,
        diagnostics,
    })
}

fn build_group_diagnostics(
    lms_groups: &[Group],
    group_member_counts: &HashMap<String, usize>,
    generated_group_names: &HashSet<String>,
    full_groups: bool,
) -> Vec<String> {
    let mut diagnostics = Vec::new();

    let mut name_to_groups: HashMap<String, Vec<&Group>> = HashMap::new();
    for group in lms_groups {
        name_to_groups
            .entry(group.name.clone())
            .or_default()
            .push(group);
    }

    let mut duplicate_lines = Vec::new();
    for (name, groups) in name_to_groups.iter().filter(|(_, groups)| groups.len() > 1) {
        let mut id_parts = Vec::new();
        for group in groups {
            let member_count = group_member_counts.get(&group.id).copied().unwrap_or(0);
            let detail = match group.max_membership {
                Some(max) => format!("{} ({}/{})", group.id, member_count, max),
                None => format!("{} ({} members)", group.id, member_count),
            };
            id_parts.push(detail);
        }
        id_parts.sort();
        let trimmed_name = name.trim();
        let display_name = if trimmed_name.is_empty() {
            "unnamed"
        } else {
            trimmed_name
        };
        duplicate_lines.push(format!("{}: {}", display_name, id_parts.join(", ")));
    }
    duplicate_lines.sort();
    if !duplicate_lines.is_empty() {
        diagnostics.push(format!(
            "Duplicate group names merged: {}",
            duplicate_lines.join("; ")
        ));
    }

    let mut missing_lines = Vec::new();
    for group in lms_groups {
        if generated_group_names.contains(&group.name) {
            continue;
        }

        let member_count = group_member_counts.get(&group.id).copied().unwrap_or(0);
        let reason = if member_count == 0 {
            "no members".to_string()
        } else if full_groups {
            match group.max_membership {
                Some(max) if member_count < max as usize => {
                    format!("not full ({}/{})", member_count, max)
                }
                _ => "not included".to_string(),
            }
        } else {
            "not included".to_string()
        };

        let trimmed_name = group.name.trim();
        let display_name = if trimmed_name.is_empty() {
            "unnamed"
        } else {
            trimmed_name
        };
        missing_lines.push(format!("- {} (id {}): {}", display_name, group.id, reason));
    }
    missing_lines.sort();
    if !missing_lines.is_empty() {
        diagnostics.push("Groups not included:".to_string());
        diagnostics.extend(missing_lines);
    }

    diagnostics
}
