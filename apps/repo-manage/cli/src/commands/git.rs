use anyhow::Result;
use repo_manage_core::operations;

use crate::output::{print_error, print_success};
use crate::util::{load_git_connection, resolve_profile};
use repo_manage_core::SettingsManager;

pub async fn verify(profile: Option<String>) -> Result<()> {
    let profile = resolve_profile(profile)?;

    let manager = SettingsManager::new()?;
    let connection = load_git_connection(&manager, &profile)?;

    println!("Verifying git connection...");

    let result = operations::verify_connection(&connection).await?;

    if result.success {
        if let Some(username) = result.username.as_deref() {
            let handle = format!("@{}", username);
            if !result.message.contains(&handle) {
                print_success(&format!("Connected as {}", handle));
            }
        }
        print_success(&result.message);
    } else {
        print_error(&result.message);
        std::process::exit(1);
    }

    Ok(())
}
