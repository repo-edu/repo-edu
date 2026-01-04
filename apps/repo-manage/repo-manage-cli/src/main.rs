//! RepoBee CLI - Command-line interface for RepoBee
//!
//! This CLI provides commands for managing student repositories across
//! GitHub, GitLab, Gitea, and local filesystem platforms, as well as
//! LMS integration for Canvas and Moodle.

use anyhow::{Context, Result};
use clap::{CommandFactory, Parser, Subcommand, ValueEnum};
use repo_manage_core::{ProfileSettings, SettingsManager};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "redu")]
#[command(author, version, about = "Repository and LMS management for education")]
#[command(propagate_version = true)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// Print complete CLI documentation as markdown
    #[arg(long)]
    markdown_help: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// LMS operations (Canvas/Moodle)
    Lms {
        #[command(subcommand)]
        action: LmsAction,
    },

    /// Repository operations (GitHub/GitLab/Gitea)
    Repo {
        #[command(subcommand)]
        action: RepoAction,
    },

    /// Profile management
    Profile {
        #[command(subcommand)]
        action: ProfileAction,
    },
}

#[derive(Subcommand)]
enum LmsAction {
    /// Verify LMS course connection
    Verify {
        /// Override LMS type (Canvas, Moodle)
        #[arg(long)]
        lms_type: Option<String>,

        /// Override course ID
        #[arg(long)]
        course_id: Option<String>,
    },

    /// Generate student files from LMS
    Generate {
        /// Override output folder
        #[arg(long)]
        output: Option<String>,

        /// Generate YAML file
        #[arg(long)]
        yaml: Option<bool>,

        /// Generate CSV file
        #[arg(long)]
        csv: Option<bool>,
    },
}

#[derive(Subcommand)]
enum RepoAction {
    /// Verify git platform connection
    Verify {
        /// Platform (github, gitlab, gitea, local)
        #[arg(short, long, value_enum)]
        platform: Option<PlatformType>,
    },

    /// Set up student repositories from templates
    Setup {
        /// Platform to use
        #[arg(short, long, value_enum)]
        platform: Option<PlatformType>,

        /// Template repository names (can be specified multiple times)
        #[arg(long = "template")]
        templates: Vec<String>,

        /// Student teams file (JSON/YAML format)
        #[arg(long)]
        teams_file: Option<PathBuf>,

        /// Working directory for cloning templates
        #[arg(long)]
        work_dir: Option<PathBuf>,

        /// Create private repositories
        #[arg(long)]
        private: Option<bool>,

        /// Student teams in format "name:member1,member2" (can be specified multiple times)
        #[arg(long = "team")]
        teams: Vec<String>,
    },

    /// Clone student repositories
    Clone {
        /// Platform to use
        #[arg(short, long, value_enum)]
        platform: Option<PlatformType>,

        /// Specific assignments to clone (overrides settings)
        #[arg(long)]
        assignments: Option<String>,
    },
}

#[derive(Subcommand)]
enum ProfileAction {
    /// List all available profiles
    List,

    /// Show the active profile name
    Active,

    /// Show settings of active profile
    Show,

    /// Load a profile (set as active)
    Load {
        /// Profile name to load
        name: String,
    },
}

#[derive(Debug, Clone, Copy, ValueEnum)]
#[clap(rename_all = "lower")]
enum PlatformType {
    GitHub,
    GitLab,
    Gitea,
    Local,
}

// CLI progress handler removed until roster-based commands are implemented.

/// Configuration manager for CLI
struct ConfigManager {
    settings_manager: SettingsManager,
    config: ProfileSettings,
    active_profile: Option<String>,
}

impl ConfigManager {
    /// Create a new configuration manager
    fn new() -> Result<Self> {
        let settings_manager =
            SettingsManager::new().context("Failed to create settings manager")?;

        // Get active profile name
        let active_profile = settings_manager.get_active_profile().ok().flatten();

        // Load configuration or use defaults
        let config = settings_manager.load().unwrap_or_default();

        Ok(Self {
            settings_manager,
            config,
            active_profile,
        })
    }

    /// Show current configuration
    fn show(&self) {
        println!("Current Configuration:");
        println!("======================");
        println!();
        println!(
            "Active Profile: {}",
            self.active_profile.as_deref().unwrap_or("(none)")
        );
        println!();
        println!("Course Settings:");
        println!("  Course ID       : {}", self.config.course.id);
        println!("  Course Name     : {}", self.config.course.name);
        println!();
        println!("Git Connection:");
        println!(
            "  Selected        : {}",
            self.config.git_connection.as_deref().unwrap_or("(none)")
        );
        println!();
        println!("Operations:");
        println!("  Target Org      : {}", self.config.operations.target_org);
        println!(
            "  Repo Template   : {}",
            self.config.operations.repo_name_template
        );
        println!(
            "  Clone Layout    : {}",
            self.config.operations.clone.directory_layout
        );
        println!();
        println!("Exports:");
        println!("  Output Folder   : {}", self.config.exports.output_folder);
        println!(
            "  Formats         : csv={}, xlsx={}, yaml={}",
            self.config.exports.output_csv,
            self.config.exports.output_xlsx,
            self.config.exports.output_yaml
        );
        println!();
        println!("Settings Directory:");
        println!(
            "  Location        : {}",
            self.settings_manager.config_dir_path().display()
        );
    }

    /// Get configuration
    fn config(&self) -> &ProfileSettings {
        &self.config
    }

    // ===== Profile Management =====

    /// List all profiles
    fn list_profiles(&self) -> Result<Vec<String>> {
        self.settings_manager
            .list_profiles()
            .context("Failed to list profiles")
    }

    /// Get active profile name
    fn get_active_profile(&self) -> Option<&str> {
        self.active_profile.as_deref()
    }

    /// Activate a profile (load its settings)
    fn activate_profile(&mut self, name: &str) -> Result<()> {
        // Load the profile
        let profile_settings = self
            .settings_manager
            .load_profile_settings(name)
            .with_context(|| format!("Failed to load profile: {}", name))?;

        // Set as active
        self.settings_manager
            .set_active_profile(name)
            .context("Failed to set active profile")?;

        self.config = profile_settings;
        self.active_profile = Some(name.to_string());
        println!("Activated profile: {}", name);
        Ok(())
    }
}

// ===== LMS / Repo Commands =====
// CLI operations will be reintroduced after roster-based workflows land.

// ===== Main =====

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Handle markdown help generation
    if cli.markdown_help {
        let markdown = clap_markdown::help_markdown::<Cli>();
        println!("{}", markdown);
        return Ok(());
    }

    // Create configuration manager
    let mut config_mgr = ConfigManager::new()?;

    // If no command was provided, show help
    let Some(command) = cli.command else {
        Cli::command().print_help()?;
        return Ok(());
    };

    match command {
        Commands::Lms { .. } => {
            anyhow::bail!("LMS CLI commands are temporarily unavailable during roster refactor")
        }
        Commands::Repo { .. } => {
            anyhow::bail!("Repo CLI commands are temporarily unavailable during roster refactor")
        }
        Commands::Profile { action } => match action {
            ProfileAction::List => {
                let profiles = config_mgr.list_profiles()?;
                let active = config_mgr.get_active_profile();
                println!("Available profiles:");
                if profiles.is_empty() {
                    println!("  (no profiles found)");
                } else {
                    for name in profiles {
                        if Some(name.as_str()) == active {
                            println!("  * {} (active)", name);
                        } else {
                            println!("    {}", name);
                        }
                    }
                }
                Ok(())
            }
            ProfileAction::Active => {
                match config_mgr.get_active_profile() {
                    Some(name) => println!("Active profile: {}", name),
                    None => println!("No active profile"),
                }
                Ok(())
            }
            ProfileAction::Show => {
                config_mgr.show();
                Ok(())
            }
            ProfileAction::Load { name } => config_mgr.activate_profile(&name),
        },
    }
}
