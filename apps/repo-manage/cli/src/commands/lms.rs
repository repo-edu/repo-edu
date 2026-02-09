use anyhow::Result;
use repo_manage_core::{operations, SettingsManager};

use crate::output::{print_success, print_warning};
use crate::util::{load_lms_context, resolve_profile};

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
    _assignment: String,
    _group_set: Option<String>,
    _from_cache: bool,
) -> Result<()> {
    let _profile = resolve_profile(profile)?;
    anyhow::bail!(
        "The 'import-groups' command is being redesigned. \
         Use the GUI to manage group sets and assignments."
    );
}

pub fn cache_list(_profile: Option<String>) -> Result<()> {
    anyhow::bail!(
        "Group set caching has been replaced by the new group set model. \
         Use 'redu lms import-students' to import roster data."
    );
}

pub async fn cache_fetch(_profile: Option<String>, _group_set: Option<String>) -> Result<()> {
    anyhow::bail!(
        "Group set caching has been replaced by the new group set model. \
         Use the GUI to manage group sets and assignments."
    );
}

pub async fn cache_refresh(_profile: Option<String>, _group_set_id: String) -> Result<()> {
    anyhow::bail!(
        "Group set caching has been replaced by the new group set model. \
         Use the GUI to manage group sets and assignments."
    );
}

pub fn cache_delete(_profile: Option<String>, _group_set_id: String) -> Result<()> {
    anyhow::bail!(
        "Group set caching has been replaced by the new group set model. \
         Use the GUI to manage group sets and assignments."
    );
}
