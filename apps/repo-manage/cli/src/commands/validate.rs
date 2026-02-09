use anyhow::Result;
use repo_manage_core::roster::{resolve_assignment_groups, Roster};
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
            let groups = resolve_assignment_groups(&roster, assignment);
            let non_empty_groups = groups.iter().filter(|g| !g.member_ids.is_empty()).count();
            let total_members: usize = groups.iter().map(|g| g.member_ids.len()).sum();
            println!(
                "  Groups: {} ({} non-empty)",
                groups.len(),
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
    _assignment_id: &AssignmentId,
    issue: &ValidationIssue,
) -> String {
    use repo_manage_core::ValidationKind;

    let resolve_member = |id: &str| {
        roster
            .students
            .iter()
            .chain(roster.staff.iter())
            .find(|m| m.id.to_string() == id)
            .map(|m| format!("{} ({})", m.email, m.name))
            .unwrap_or_else(|| id.to_string())
    };

    let resolve_group = |id: &str| {
        roster
            .groups
            .iter()
            .find(|g| g.id == id)
            .map(|g| g.name.clone())
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
                .map(|id| resolve_member(id))
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
