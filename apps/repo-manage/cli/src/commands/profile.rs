use anyhow::Result;
use repo_manage_core::SettingsManager;

use crate::output::print_success;

pub fn list() -> Result<()> {
    let manager = SettingsManager::new()?;
    let profiles = manager.list_profiles()?;
    let active = manager.get_active_profile()?;

    if profiles.is_empty() {
        println!("No profiles configured.");
        return Ok(());
    }

    println!("Profiles:");
    for name in profiles {
        if active.as_deref() == Some(name.as_str()) {
            println!("  * {} (active)", name);
        } else {
            println!("  {}", name);
        }
    }
    Ok(())
}

pub fn active() -> Result<()> {
    let manager = SettingsManager::new()?;
    match manager.get_active_profile()? {
        Some(name) => println!("{}", name),
        None => println!("No active profile"),
    }
    Ok(())
}

pub fn show() -> Result<()> {
    let manager = SettingsManager::new()?;
    let active = manager
        .get_active_profile()?
        .ok_or_else(|| anyhow::anyhow!("No active profile"))?;

    let settings = manager.load_profile_settings(&active)?;
    println!("Profile: {}", active);
    println!();

    if let Some(git) = &settings.git_connection {
        println!("Git connection: {}", git);
    }
    println!("Course: {} ({})", settings.course.name, settings.course.id);
    println!("Target org: {}", settings.operations.target_org);
    println!("Repo template: {}", settings.operations.repo_name_template);

    Ok(())
}

pub fn load(name: String) -> Result<()> {
    let manager = SettingsManager::new()?;

    let loaded = manager.load_profile(&name)?;
    if !loaded.warnings.is_empty() {
        eprintln!("Profile loaded with warnings:");
        for warning in loaded.warnings {
            eprintln!("  - {}", warning);
        }
    }
    print_success(&format!("Active profile set to '{}'", name));
    Ok(())
}
