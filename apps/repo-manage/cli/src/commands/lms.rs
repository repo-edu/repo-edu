use anyhow::Result;
use repo_manage_core::{operations, GroupFilter, GroupImportConfig, SettingsManager};

use crate::output::{print_success, print_warning};
use crate::util::{
    load_lms_context, load_roster, prompt_with_default, resolve_assignment, resolve_profile,
};

pub async fn verify(profile: Option<String>) -> Result<()> {
    let profile = resolve_profile(profile)?;
    let manager = SettingsManager::new()?;
    let context = load_lms_context(&manager, &profile)?;
    println!("Verifying LMS connection...");

    let result = operations::verify_lms_connection(&context).await?;
    if result.success {
        print_success(&result.message);
        if let Some(lms_type) = result.lms_type {
            println!("  LMS: {:?}", lms_type);
        }
    } else {
        print_warning(&result.message);
        std::process::exit(1);
    }

    Ok(())
}

pub async fn import_students(profile: Option<String>) -> Result<()> {
    let profile = resolve_profile(profile)?;
    let manager = SettingsManager::new()?;
    let context = load_lms_context(&manager, &profile)?;
    let existing_roster = manager.load_roster(&profile)?;

    println!("Importing students from LMS...");

    let result = operations::import_students(&context, existing_roster).await?;

    let total = result.summary.students_added
        + result.summary.students_updated
        + result.summary.students_unchanged;
    print_success(&format!("Fetched {} students", total));
    println!("  Added: {}", result.summary.students_added);
    println!("  Updated: {}", result.summary.students_updated);
    println!("  Unchanged: {}", result.summary.students_unchanged);
    println!("  Missing email: {}", result.summary.students_missing_email);

    manager.save_roster(&profile, &result.roster)?;
    println!("\nRoster saved.");

    Ok(())
}

pub async fn import_groups(
    profile: Option<String>,
    assignment: String,
    group_set: Option<String>,
) -> Result<()> {
    let profile = resolve_profile(profile)?;
    let manager = SettingsManager::new()?;
    let context = load_lms_context(&manager, &profile)?;
    let roster = load_roster(&manager, &profile)?;
    let assignment_id = resolve_assignment(&roster, &assignment)?;

    let group_set_id = match group_set {
        Some(id) => id,
        None => {
            println!("Fetching group-sets from LMS...");
            let group_sets = operations::fetch_group_set_list(&context).await?;

            if group_sets.is_empty() {
                anyhow::bail!("No group-sets found in course");
            }

            println!("Available group-sets:");
            for (index, group_set) in group_sets.iter().enumerate() {
                println!("  {}. {} (id: {})", index + 1, group_set.name, group_set.id);
            }

            let selection = prompt_with_default("Select group-set number", "1")?;
            let index: usize = selection.parse()?;
            if index < 1 || index > group_sets.len() {
                anyhow::bail!("Invalid selection");
            }
            group_sets[index - 1].id.clone()
        }
    };

    println!("Importing groups into '{}'...", assignment);

    let config = GroupImportConfig {
        group_set_id,
        filter: GroupFilter {
            kind: "all".to_string(),
            selected: None,
            pattern: None,
        },
    };

    let result = operations::import_groups(&context, roster, &assignment_id, config).await?;

    print_success(&format!(
        "Imported {} groups ({} students)",
        result.summary.groups_imported, result.summary.students_referenced
    ));
    println!("  Replaced: {}", result.summary.groups_replaced);
    println!("  Filter: {}", result.summary.filter_applied);

    manager.save_roster(&profile, &result.roster)?;
    println!("\nRoster saved.");

    Ok(())
}
