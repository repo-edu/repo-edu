use anyhow::Result;
use chrono::Utc;
use repo_manage_core::{
    operations, GroupFilter, GroupImportConfig, LmsContextKey, LmsGroupSetCacheEntry,
    SettingsManager,
};

use crate::output::{print_success, print_warning};
use crate::util::{
    load_lms_context, load_lms_context_key, load_roster, prompt_with_default, resolve_assignment,
    resolve_profile,
};

const STALENESS_THRESHOLD_HOURS: i64 = 24;

fn matches_context(entry: &LmsGroupSetCacheEntry, context_key: &LmsContextKey) -> bool {
    entry.lms_type == context_key.lms_type
        && entry.base_url == context_key.base_url
        && entry.course_id == context_key.course_id
}

fn filter_cache_entries(
    entries: Vec<LmsGroupSetCacheEntry>,
    context_key: &LmsContextKey,
) -> Vec<LmsGroupSetCacheEntry> {
    entries
        .into_iter()
        .filter(|entry| matches_context(entry, context_key))
        .collect()
}

fn select_cached_group_set(entries: &[LmsGroupSetCacheEntry]) -> Result<String> {
    println!("Available cached group-sets:");
    for (index, entry) in entries.iter().enumerate() {
        let total_members: usize = entry
            .groups
            .iter()
            .map(|g| g.resolved_member_ids.len())
            .sum();
        println!(
            "  {}. {} ({} groups, {} members) - id: {}",
            index + 1,
            entry.name,
            entry.groups.len(),
            total_members,
            entry.id
        );
    }

    let selection = prompt_with_default("Select group-set number", "1")?;
    let index: usize = selection.parse()?;
    if index < 1 || index > entries.len() {
        anyhow::bail!("Invalid selection");
    }
    Ok(entries[index - 1].id.clone())
}

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
    from_cache: bool,
) -> Result<()> {
    let profile = resolve_profile(profile)?;
    let manager = SettingsManager::new()?;
    let roster = load_roster(&manager, &profile)?;
    let assignment_id = resolve_assignment(&roster, &assignment)?;
    let context_key = load_lms_context_key(&manager, &profile)?;
    let cache_entries = filter_cache_entries(
        roster.lms_group_sets.clone().unwrap_or_default(),
        &context_key,
    );

    let mut use_cache = from_cache;
    let group_set_id = match group_set {
        Some(id) => {
            if cache_entries.iter().any(|entry| entry.id == id) {
                use_cache = true;
            }
            if from_cache && !use_cache {
                anyhow::bail!(
                    "Cached group-set '{}' not found for the active LMS context",
                    id
                );
            }
            id
        }
        None => {
            if cache_entries.is_empty() {
                if from_cache {
                    anyhow::bail!(
                        "No cached group-sets available for the active LMS context. Use 'redu lms cache fetch' first."
                    );
                }
                let context = load_lms_context(&manager, &profile)?;
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
            } else {
                use_cache = true;
                select_cached_group_set(&cache_entries)?
            }
        }
    };

    if use_cache {
        println!("Importing groups from cache into '{}'...", assignment);

        let result = operations::apply_cached_group_set_to_assignment(
            roster,
            &assignment_id,
            GroupImportConfig {
                group_set_id,
                filter: GroupFilter {
                    kind: "all".to_string(),
                    selected: None,
                    pattern: None,
                },
            },
        )?;

        print_success(&format!(
            "Imported {} groups ({} students)",
            result.summary.groups_imported, result.summary.students_referenced
        ));
        println!("  Replaced: {}", result.summary.groups_replaced);
        println!("  Source: Cached");

        manager.save_roster(&profile, &result.roster)?;
        println!("\nRoster saved.");
    } else {
        // Import from LMS (and cache)
        let context = load_lms_context(&manager, &profile)?;

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
    }

    Ok(())
}

pub fn cache_list(profile: Option<String>) -> Result<()> {
    let profile = resolve_profile(profile)?;
    let manager = SettingsManager::new()?;
    let roster = load_roster(&manager, &profile)?;
    let context_key = load_lms_context_key(&manager, &profile)?;

    let cache_entries =
        filter_cache_entries(roster.lms_group_sets.unwrap_or_default(), &context_key);

    if cache_entries.is_empty() {
        println!("No cached group-sets for the active LMS context.");
        return Ok(());
    }

    println!("Cached group-sets ({}):", cache_entries.len());
    for entry in &cache_entries {
        let (stale_marker, fetched_label) = match entry.fetched_at {
            Some(fetched_at) => {
                let age = Utc::now().signed_duration_since(fetched_at);
                let age_hours = age.num_hours();
                let stale_marker = if age_hours > STALENESS_THRESHOLD_HOURS {
                    " [stale]"
                } else {
                    ""
                };
                (
                    stale_marker,
                    fetched_at.format("%Y-%m-%d %H:%M UTC").to_string(),
                )
            }
            None => ("", "—".to_string()),
        };

        let total_members: usize = entry
            .groups
            .iter()
            .map(|g| g.resolved_member_ids.len())
            .sum();
        let unresolved: i64 = entry.groups.iter().map(|g| g.unresolved_count).sum();
        let needs_reresolution = entry.groups.iter().any(|g| g.needs_reresolution);

        println!();
        println!("  {} (id: {}){}", entry.name, entry.id, stale_marker);
        println!(
            "    {} groups, {} members resolved",
            entry.groups.len(),
            total_members
        );
        if unresolved > 0 {
            print_warning(&format!("    {} unresolved LMS users", unresolved));
        }
        if needs_reresolution {
            print_warning("    Needs re-resolution after roster changes");
        }
        println!("    Fetched: {}", fetched_label);
    }

    Ok(())
}

pub async fn cache_fetch(profile: Option<String>, group_set: Option<String>) -> Result<()> {
    let profile = resolve_profile(profile)?;
    let manager = SettingsManager::new()?;
    let context = load_lms_context(&manager, &profile)?;
    let existing_roster = manager.load_roster(&profile)?;

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

    println!("Caching group-set from LMS...");

    let roster = operations::cache_group_set(&context, existing_roster, &group_set_id).await?;

    // Find the cached entry to report stats
    let entry = roster
        .lms_group_sets
        .as_ref()
        .and_then(|entries| entries.iter().find(|e| e.id == group_set_id));

    if let Some(entry) = entry {
        let total_members: usize = entry
            .groups
            .iter()
            .map(|g| g.resolved_member_ids.len())
            .sum();
        let unresolved: i64 = entry.groups.iter().map(|g| g.unresolved_count).sum();

        print_success(&format!(
            "Cached '{}' ({} groups, {} members)",
            entry.name,
            entry.groups.len(),
            total_members
        ));
        if unresolved > 0 {
            print_warning(&format!("{} LMS users could not be resolved", unresolved));
        }
    } else {
        print_success("Group-set cached");
    }

    manager.save_roster(&profile, &roster)?;
    println!("\nRoster saved.");

    Ok(())
}

pub async fn cache_refresh(profile: Option<String>, group_set_id: String) -> Result<()> {
    let profile = resolve_profile(profile)?;
    let manager = SettingsManager::new()?;
    let context = load_lms_context(&manager, &profile)?;
    let roster = load_roster(&manager, &profile)?;
    let context_key = load_lms_context_key(&manager, &profile)?;

    let cache_entries = filter_cache_entries(
        roster.lms_group_sets.clone().unwrap_or_default(),
        &context_key,
    );
    if !cache_entries.iter().any(|entry| entry.id == group_set_id) {
        anyhow::bail!(
            "Cached group-set '{}' not found for the active LMS context",
            group_set_id
        );
    }

    println!("Refreshing cached group-set from LMS...");

    let updated_roster =
        operations::refresh_cached_group_set(&context, roster, &group_set_id).await?;

    // Find the refreshed entry to report stats
    let entry = updated_roster
        .lms_group_sets
        .as_ref()
        .and_then(|entries| entries.iter().find(|e| e.id == group_set_id));

    if let Some(entry) = entry {
        let total_members: usize = entry
            .groups
            .iter()
            .map(|g| g.resolved_member_ids.len())
            .sum();
        let unresolved: i64 = entry.groups.iter().map(|g| g.unresolved_count).sum();

        print_success(&format!(
            "Refreshed '{}' ({} groups, {} members)",
            entry.name,
            entry.groups.len(),
            total_members
        ));
        if unresolved > 0 {
            print_warning(&format!("{} LMS users could not be resolved", unresolved));
        }
    } else {
        print_success("Group-set refreshed");
    }

    manager.save_roster(&profile, &updated_roster)?;
    println!("\nRoster saved.");

    Ok(())
}

pub fn cache_delete(profile: Option<String>, group_set_id: String) -> Result<()> {
    let profile = resolve_profile(profile)?;
    let manager = SettingsManager::new()?;
    let roster = load_roster(&manager, &profile)?;
    let context_key = load_lms_context_key(&manager, &profile)?;

    // Find the entry name for the message
    let entry_name = roster
        .lms_group_sets
        .as_ref()
        .and_then(|entries| {
            entries
                .iter()
                .find(|e| e.id == group_set_id && matches_context(e, &context_key))
        })
        .map(|e| e.name.clone());

    if entry_name.is_none() {
        anyhow::bail!(
            "Cached group-set '{}' not found for the active LMS context",
            group_set_id
        );
    }

    let updated_roster = operations::delete_cached_group_set(roster, &group_set_id)?;

    if let Some(name) = entry_name {
        print_success(&format!("Deleted cached group-set '{}'", name));
    } else {
        print_success("Deleted cached group-set");
    }

    // Check if any assignments reference this deleted cache entry
    let affected_assignments: Vec<_> = updated_roster
        .assignments
        .iter()
        .filter(|a| a.group_set_cache_id.as_deref() == Some(&group_set_id))
        .map(|a| a.name.clone())
        .collect();

    if !affected_assignments.is_empty() {
        print_warning(&format!(
            "The following assignments now have a missing source: {}",
            affected_assignments.join(", ")
        ));
    }

    manager.save_roster(&profile, &updated_roster)?;
    println!("\nRoster saved.");

    Ok(())
}
