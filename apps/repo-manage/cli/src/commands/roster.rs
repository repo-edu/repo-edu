use anyhow::Result;
use repo_manage_core::roster::resolve_assignment_groups;
use repo_manage_core::SettingsManager;

use crate::util::{load_roster, resolve_profile};

pub fn show(profile: Option<String>, students: bool, assignments: bool) -> Result<()> {
    let profile = resolve_profile(profile)?;
    let manager = SettingsManager::new()?;
    let roster = load_roster(&manager, &profile)?;

    println!("Roster Summary");
    println!("==============");
    println!("Profile: {}", profile);
    println!("Students: {}", roster.students.len());
    println!("Staff: {}", roster.staff.len());
    println!("Assignments: {}", roster.assignments.len());
    println!("Group Sets: {}", roster.group_sets.len());
    println!("Groups: {}", roster.groups.len());

    for assignment in &roster.assignments {
        let groups = resolve_assignment_groups(&roster, assignment);
        println!("  - {} ({} groups)", assignment.name, groups.len());
    }

    if students {
        println!();
        println!("Students ({}):", roster.students.len());
        for member in &roster.students {
            let git = member
                .git_username
                .as_deref()
                .map(|name| format!("@{}", name))
                .unwrap_or_else(|| "-".to_string());
            println!("  {}  {}  {}", member.email, member.name, git);
        }
    }

    if assignments {
        println!();
        for assignment in &roster.assignments {
            let groups = resolve_assignment_groups(&roster, assignment);
            println!("Assignment: {} ({} groups)", assignment.name, groups.len());
            for group in &groups {
                let members: Vec<_> = group
                    .member_ids
                    .iter()
                    .filter_map(|id| {
                        roster
                            .students
                            .iter()
                            .chain(roster.staff.iter())
                            .find(|m| m.id == *id)
                    })
                    .map(|m| m.email.as_str())
                    .collect();
                println!(
                    "  {} ({}): {}",
                    group.name,
                    members.len(),
                    members.join(", ")
                );
            }
            println!();
        }
    }

    Ok(())
}
