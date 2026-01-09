use anyhow::Result;
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
    println!("Assignments: {}", roster.assignments.len());

    for assignment in &roster.assignments {
        println!(
            "  - {} ({} groups)",
            assignment.name,
            assignment.groups.len()
        );
    }

    if students {
        println!();
        println!("Students ({}):", roster.students.len());
        for student in &roster.students {
            let git = student
                .git_username
                .as_deref()
                .map(|name| format!("@{}", name))
                .unwrap_or_else(|| "-".to_string());
            println!("  {}  {}  {}", student.email, student.name, git);
        }
    }

    if assignments {
        println!();
        for assignment in &roster.assignments {
            println!(
                "Assignment: {} ({} groups)",
                assignment.name,
                assignment.groups.len()
            );
            for group in &assignment.groups {
                let members: Vec<_> = group
                    .member_ids
                    .iter()
                    .filter_map(|id| roster.students.iter().find(|student| student.id == *id))
                    .map(|student| student.email.as_str())
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
