use anyhow::Result;
use repo_manage_core::{operations, DirectoryLayout, RepoCollisionKind, SettingsManager};

use crate::output::{
    exit_code_for_operation_result, print_operation_result, print_progress, print_warning,
};
use crate::util::{confirm, load_repo_context, load_roster, resolve_assignment, resolve_profile};
use std::io::Write;

pub async fn create(profile: Option<String>, assignment: String, dry_run: bool) -> Result<()> {
    let profile = resolve_profile(profile)?;
    let manager = SettingsManager::new()?;
    let profile_settings = manager.load_profile_settings(&profile)?;
    let roster = load_roster(&manager, &profile)?;
    let assignment_id = resolve_assignment(&roster, &assignment)?;
    let context = load_repo_context(&manager, &profile)?;

    println!("Creating repositories for '{}'...\n", assignment);

    let config = profile_settings.operations.create.clone();
    let preflight =
        operations::preflight_create(&context, &roster, &assignment_id, &config).await?;

    let already_exists: Vec<_> = preflight
        .collisions
        .iter()
        .filter(|collision| collision.kind == RepoCollisionKind::AlreadyExists)
        .collect();

    println!("Preflight check:");
    println!("  Ready to create: {}", preflight.ready_count);
    println!("  Already exist: {}", already_exists.len());

    if !already_exists.is_empty() {
        for collision in already_exists {
            print_warning(&format!(
                "  {} ({})",
                collision.group_name, collision.repo_name
            ));
        }
    }

    if dry_run {
        println!("\n(dry run - no changes made)");
        return Ok(());
    }

    if preflight.ready_count == 0 {
        println!("\nNothing to create.");
        return Ok(());
    }

    if !confirm("\nProceed?")? {
        println!("Cancelled.");
        return Ok(());
    }

    let params = operations::CreateReposParams {
        context,
        roster,
        assignment_id,
        config,
    };
    let result = operations::create_repos(params, print_progress).await?;
    print_operation_result(&result);
    std::process::exit(exit_code_for_operation_result(&result));
}

pub async fn clone(
    profile: Option<String>,
    assignment: String,
    target: Option<String>,
    layout: Option<String>,
) -> Result<()> {
    let profile = resolve_profile(profile)?;
    let manager = SettingsManager::new()?;
    let profile_settings = manager.load_profile_settings(&profile)?;
    let roster = load_roster(&manager, &profile)?;
    let assignment_id = resolve_assignment(&roster, &assignment)?;
    let context = load_repo_context(&manager, &profile)?;

    let mut config = profile_settings.operations.clone.clone();
    if let Some(target_dir) = target {
        config.target_dir = target_dir;
    } else if config.target_dir.is_empty() {
        config.target_dir = ".".to_string();
    }
    if let Some(layout) = layout {
        config.directory_layout = match layout.as_str() {
            "flat" => DirectoryLayout::Flat,
            "by-team" => DirectoryLayout::ByTeam,
            "by-task" => DirectoryLayout::ByTask,
            other => anyhow::bail!("Invalid layout '{}'. Use: flat, by-team, by-task", other),
        };
    }

    println!("Cloning repositories for '{}'...\n", assignment);

    let preflight = operations::preflight_clone(&context, &roster, &assignment_id, &config).await?;

    let not_found: Vec<_> = preflight
        .collisions
        .iter()
        .filter(|collision| collision.kind == RepoCollisionKind::NotFound)
        .collect();

    println!("Preflight check:");
    println!("  Ready to clone: {}", preflight.ready_count);
    println!("  Not found: {}", not_found.len());

    if !not_found.is_empty() {
        for collision in not_found {
            print_warning(&format!(
                "  {} ({})",
                collision.group_name, collision.repo_name
            ));
        }
    }

    if preflight.ready_count == 0 {
        println!("\nNothing to clone.");
        return Ok(());
    }

    let params = operations::CloneReposParams {
        context,
        roster,
        assignment_id,
        config,
    };
    let result = operations::clone_repos(params, print_progress).await?;
    print_operation_result(&result);
    std::process::exit(exit_code_for_operation_result(&result));
}

pub async fn delete(profile: Option<String>, assignment: String, force: bool) -> Result<()> {
    let profile = resolve_profile(profile)?;
    let manager = SettingsManager::new()?;
    let profile_settings = manager.load_profile_settings(&profile)?;
    let roster = load_roster(&manager, &profile)?;
    let assignment_id = resolve_assignment(&roster, &assignment)?;
    let context = load_repo_context(&manager, &profile)?;

    println!("Deleting repositories for '{}'...\n", assignment);

    let config = profile_settings.operations.delete.clone();
    let preflight =
        operations::preflight_delete(&context, &roster, &assignment_id, &config).await?;

    if preflight.ready_count == 0 {
        println!("No repositories found to delete.");
        return Ok(());
    }

    println!(
        "WARNING: This will permanently delete {} repositories!",
        preflight.ready_count
    );
    println!();

    let not_found: Vec<_> = preflight
        .collisions
        .iter()
        .filter(|collision| collision.kind == RepoCollisionKind::NotFound)
        .collect();

    if !not_found.is_empty() {
        println!("Not found (will skip):");
        for collision in not_found {
            println!("  {} ({})", collision.group_name, collision.repo_name);
        }
        println!();
    }

    if !force {
        print!("Type 'delete' to confirm: ");
        std::io::stdout().flush()?;
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        if input.trim() != "delete" {
            println!("Cancelled.");
            return Ok(());
        }
    }

    let params = operations::DeleteReposParams {
        context,
        roster,
        assignment_id,
        config,
    };
    let result = operations::delete_repos(params, print_progress).await?;
    print_operation_result(&result);
    std::process::exit(exit_code_for_operation_result(&result));
}
