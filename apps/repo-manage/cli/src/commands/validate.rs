use anyhow::Result;
use repo_manage_core::roster::Roster;
use repo_manage_core::{operations, AssignmentId, SettingsManager, ValidationIssue};

use crate::output::{print_success, print_warning};
use crate::util::{
    load_git_connection, load_roster, resolve_assignment, resolve_identity_mode, resolve_profile,
};

pub fn validate_assignment(profile: Option<String>, assignment: String) -> Result<()> {
    let profile = resolve_profile(profile)?;
    let manager = SettingsManager::new()?;
    let roster = load_roster(&manager, &profile)?;
    let assignment_id = resolve_assignment(&roster, &assignment)?;

    let connection = load_git_connection(&manager, &profile)?;
    let identity_mode = resolve_identity_mode(&connection);

    println!("Validating assignment '{}'...\n", assignment);

    let result = operations::validate_assignment(&roster, &assignment_id, identity_mode)?;

    if result.issues.is_empty() {
        print_success("Assignment valid");

        if let Some(assignment) = roster
            .assignments
            .iter()
            .find(|candidate| candidate.id == assignment_id)
        {
            let non_empty_groups = assignment
                .groups
                .iter()
                .filter(|group| !group.member_ids.is_empty())
                .count();
            let total_members: usize = assignment
                .groups
                .iter()
                .map(|group| group.member_ids.len())
                .sum();
            println!(
                "  Groups: {} ({} non-empty)",
                assignment.groups.len(),
                non_empty_groups
            );
            println!("  Students assigned: {}", total_members);
        }
    } else {
        print_warning("Assignment has issues:");
        for issue in &result.issues {
            println!(
                "  - {}",
                format_validation_issue(&roster, &assignment_id, issue)
            );
        }

        std::process::exit(2);
    }

    Ok(())
}

fn format_validation_issue(
    roster: &Roster,
    assignment_id: &AssignmentId,
    issue: &ValidationIssue,
) -> String {
    use repo_manage_core::ValidationKind;

    let assignment = roster
        .assignments
        .iter()
        .find(|assignment| &assignment.id == assignment_id);

    let resolve_student = |id: &str| {
        roster
            .students
            .iter()
            .find(|student| student.id.to_string() == id)
            .map(|student| format!("{} ({})", student.email, student.name))
            .unwrap_or_else(|| id.to_string())
    };

    let resolve_group = |id: &str| {
        assignment
            .and_then(|assignment| {
                assignment
                    .groups
                    .iter()
                    .find(|group| group.id.to_string() == id)
            })
            .map(|group| group.name.clone())
            .unwrap_or_else(|| id.to_string())
    };

    match issue.kind {
        ValidationKind::MissingGitUsername
        | ValidationKind::InvalidGitUsername
        | ValidationKind::StudentInMultipleGroupsInAssignment
        | ValidationKind::OrphanGroupMember => {
            let names = issue
                .affected_ids
                .iter()
                .map(|id| resolve_student(id))
                .collect::<Vec<_>>();
            format!("{:?}: {}", issue.kind, names.join(", "))
        }
        ValidationKind::EmptyGroup
        | ValidationKind::DuplicateGroupIdInAssignment
        | ValidationKind::DuplicateRepoNameInAssignment => {
            let names = issue
                .affected_ids
                .iter()
                .map(|id| resolve_group(id))
                .collect::<Vec<_>>();
            let context = issue
                .context
                .as_deref()
                .map(|value| format!(" ({})", value))
                .unwrap_or_default();
            format!("{:?}{}: {}", issue.kind, context, names.join(", "))
        }
        _ => format!("{:?}: {}", issue.kind, issue.affected_ids.join(", ")),
    }
}
