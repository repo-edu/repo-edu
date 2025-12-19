//! LMS operations - verify course and generate student files

use crate::lms::{
    create_lms_client_with_params, generate_repobee_yaml_with_progress,
    get_student_info_with_progress, write_csv_file, write_yaml_file, FetchProgress, MemberOption,
    YamlConfig,
};
use crate::progress::ProgressEvent;
use crate::{PlatformError, Result};
use lms_common::LmsClient as LmsClientTrait;
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
    pub team_count: usize,
    pub generated_files: Vec<String>,
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

    // Validate output folder exists
    if !params.output_folder.exists() {
        return Err(PlatformError::FileError(format!(
            "Output folder does not exist: {}",
            params.output_folder.display()
        )));
    }

    // Create LMS client
    let client = create_lms_client_with_params(
        &params.lms_type,
        params.base_url.clone(),
        params.access_token.clone(),
    )?;

    // Fetch students with progress
    progress(ProgressEvent::Status(
        "Fetching students from LMS...".into(),
    ));

    let students =
        get_student_info_with_progress(&client, &params.course_id, |update| match update {
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
                    current,
                    total,
                    message: format!("Fetching group: {}", group_name),
                });
            }
        })
        .await?;

    let student_count = students.len();
    progress(ProgressEvent::Status(format!(
        "Fetched {} students. Generating files...",
        student_count
    )));

    let mut generated_files = Vec::new();
    let mut team_count = 0;

    // Generate YAML if requested
    if params.yaml {
        let config = YamlConfig {
            member_option: MemberOption::parse(&params.member_option),
            include_group: params.include_group,
            include_member: params.include_member,
            include_initials: params.include_initials,
            full_groups: params.full_groups,
        };

        let teams = generate_repobee_yaml_with_progress(&students, &config, |_, _, _| {})?;
        team_count = teams.len();

        let yaml_path = params.output_folder.join(&params.yaml_file);
        write_yaml_file(&teams, &yaml_path)?;
        generated_files.push(format!(
            "YAML: {} ({} teams)",
            yaml_path.display(),
            team_count
        ));
    }

    // Generate CSV if requested
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
        team_count,
        generated_files,
    })
}
