//! RepoBee CLI - Command-line interface for RepoBee
//!
//! This CLI provides commands for managing student repositories across
//! GitHub, GitLab, Gitea, and local filesystem platforms.

use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use repo_manage_core::{
    setup_student_repos, GuiSettings, Platform, PlatformAPI, ProfileSettings, SettingsManager,
    StudentTeam,
};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "redu")]
#[command(author, version, about, long_about = None)]
#[command(propagate_version = true)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    // ===== Settings Management Flags =====
    /// Load settings from a specific file
    #[arg(long, global = true, value_name = "PATH")]
    load: Option<PathBuf>,

    /// Save current settings to the default location
    #[arg(long, global = true)]
    save: bool,

    /// Save settings to a specific file
    #[arg(long, global = true, value_name = "PATH")]
    save_as: Option<PathBuf>,

    /// Reset settings to defaults
    #[arg(long, global = true)]
    reset: bool,

    /// Show current settings and exit
    #[arg(long, global = true)]
    show: bool,

    /// Print complete CLI documentation as markdown
    #[arg(long)]
    markdown_help: bool,

    // ===== Common Configuration Options =====
    /// Git platform base URL
    #[arg(long, global = true)]
    git_base_url: Option<String>,

    /// Git access token (or use REPOBEE_TOKEN env var)
    #[arg(long, global = true, env = "REPOBEE_TOKEN")]
    git_token: Option<String>,

    /// Git user name
    #[arg(long, global = true)]
    git_user: Option<String>,

    /// Student repositories organization/group
    #[arg(long, global = true)]
    student_org: Option<String>,

    /// Template repositories organization/group
    #[arg(long, global = true)]
    template_org: Option<String>,

    /// YAML file with student teams
    #[arg(long, global = true)]
    yaml_file: Option<PathBuf>,

    /// Target folder for cloning repositories
    #[arg(long, global = true)]
    target_folder: Option<PathBuf>,

    /// Assignments (comma-separated)
    #[arg(long, global = true)]
    assignments: Option<String>,

    /// Directory layout (by-team, flat, by-task)
    #[arg(long, global = true, value_name = "LAYOUT")]
    directory_layout: Option<String>,
}

#[derive(Subcommand)]
enum Commands {
    /// Set up student repositories from templates
    Setup {
        /// Platform to use (github, gitlab, gitea, local)
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

    /// Verify platform settings and authentication
    Verify {
        /// Platform to use
        #[arg(short, long, value_enum)]
        platform: Option<PlatformType>,
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

    /// Settings management commands
    Settings {
        #[command(subcommand)]
        action: SettingsAction,
    },

    /// Profile management commands
    Profile {
        #[command(subcommand)]
        action: ProfileAction,
    },
}

#[derive(Subcommand)]
enum ProfileAction {
    /// List all available profiles
    List,

    /// Show the active profile name
    Active,

    /// Show profiles directory location
    Location,

    /// Activate a profile (load its settings)
    Activate {
        /// Profile name to activate
        name: String,
    },

    /// Create a new profile from current settings
    New {
        /// Name for the new profile
        name: String,
    },

    /// Delete a profile
    Delete {
        /// Profile name to delete
        name: String,
    },

    /// Rename a profile
    Rename {
        /// Current profile name
        old_name: String,
        /// New profile name
        new_name: String,
    },
}

#[derive(Subcommand)]
enum SettingsAction {
    /// Show current settings
    Show,

    /// Reset settings to defaults (in-memory only, use --save to persist)
    Reset,

    /// Save current settings to active profile
    Save,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum PlatformType {
    GitHub,
    GitLab,
    Gitea,
    Local,
}

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
        let gui_settings = settings_manager.load().unwrap_or_default();
        let config = gui_settings.profile;

        Ok(Self {
            settings_manager,
            config,
            active_profile,
        })
    }

    /// Apply CLI overrides to configuration
    fn apply_overrides(&mut self, cli: &Cli) {
        // Override common (git) settings
        if let Some(ref url) = cli.git_base_url {
            self.config.common.git_base_url = url.clone();
        }
        if let Some(ref token) = cli.git_token {
            self.config.common.git_access_token = token.clone();
        }
        if let Some(ref user) = cli.git_user {
            self.config.common.git_user = user.clone();
        }

        // Override repo settings
        if let Some(ref org) = cli.student_org {
            self.config.repo.student_repos_group = org.clone();
        }
        if let Some(ref org) = cli.template_org {
            self.config.repo.template_group = org.clone();
        }
        if let Some(ref yaml) = cli.yaml_file {
            self.config.repo.yaml_file = yaml.to_string_lossy().to_string();
        }
        if let Some(ref folder) = cli.target_folder {
            self.config.repo.target_folder = folder.to_string_lossy().to_string();
        }
        if let Some(ref assignments) = cli.assignments {
            self.config.repo.assignments = assignments.clone();
        }
        if let Some(ref layout) = cli.directory_layout {
            self.config.repo.directory_layout = layout.parse().unwrap_or_default();
        }
    }

    /// Save configuration to a specific path
    fn save_to_path(&self, path: &PathBuf) -> Result<()> {
        let gui_settings = repo_manage_core::GuiSettings::from_parts(
            repo_manage_core::AppSettings::default(),
            self.config.clone(),
        );

        self.settings_manager
            .save_to(&gui_settings, path)
            .context("Failed to save settings")?;
        println!("Settings saved to: {}", path.display());
        Ok(())
    }

    /// Load configuration from a specific path
    /// Note: This does NOT change the active settings location - it's just for this run
    fn load(&mut self, path: &PathBuf) -> Result<()> {
        // Read and parse the file directly without updating location
        let contents = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read config file: {}", path.display()))?;

        let gui_settings: GuiSettings = serde_json::from_str(&contents)
            .with_context(|| format!("Invalid JSON in config file: {}", path.display()))?;

        self.config = gui_settings.profile;
        println!("Settings loaded from: {}", path.display());
        Ok(())
    }

    /// Reset configuration to defaults (in-memory only, use --save to persist)
    fn reset(&mut self) {
        self.config = ProfileSettings::default();
        println!("Settings reset to defaults (not saved).");
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
        println!("Common Settings:");
        println!("  Git Base URL    : {}", self.config.common.git_base_url);
        println!("  Git User        : {}", self.config.common.git_user);
        println!(
            "  Git Token       : {}",
            if self.config.common.git_access_token.is_empty() {
                "(not set)"
            } else {
                "***"
            }
        );
        println!();
        println!("Repo Settings:");
        println!(
            "  Student Org     : {}",
            self.config.repo.student_repos_group
        );
        println!("  Template Org    : {}", self.config.repo.template_group);
        println!("  YAML File       : {}", self.config.repo.yaml_file);
        println!("  Target Folder   : {}", self.config.repo.target_folder);
        println!("  Assignments     : {}", self.config.repo.assignments);
        println!("  Directory Layout: {}", self.config.repo.directory_layout);
        println!();
        println!("LMS Settings:");
        println!("  Type            : {}", self.config.lms.r#type);
        println!("  Base URL        : {}", self.config.lms.base_url);
        println!("  Course ID       : {}", self.config.lms.course_id);
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

    /// Create a new profile from current settings
    fn create_profile(&mut self, name: &str) -> Result<()> {
        self.settings_manager
            .save_profile_settings(name, &self.config)
            .with_context(|| format!("Failed to create profile: {}", name))?;

        // Set as active
        self.settings_manager
            .set_active_profile(name)
            .context("Failed to set active profile")?;

        self.active_profile = Some(name.to_string());
        println!("Created and activated profile: {}", name);
        Ok(())
    }

    /// Delete a profile
    fn delete_profile(&self, name: &str) -> Result<()> {
        if self.active_profile.as_deref() == Some(name) {
            anyhow::bail!("Cannot delete the active profile. Switch to another profile first.");
        }

        self.settings_manager
            .delete_profile(name)
            .with_context(|| format!("Failed to delete profile: {}", name))?;

        println!("Deleted profile: {}", name);
        Ok(())
    }

    /// Rename a profile
    fn rename_profile(&mut self, old_name: &str, new_name: &str) -> Result<()> {
        self.settings_manager
            .rename_profile(old_name, new_name)
            .with_context(|| format!("Failed to rename profile: {}", old_name))?;

        if self.active_profile.as_deref() == Some(old_name) {
            self.active_profile = Some(new_name.to_string());
        }

        println!("Renamed profile '{}' to '{}'", old_name, new_name);
        Ok(())
    }

    /// Save current settings to active profile
    fn save_to_active_profile(&self) -> Result<()> {
        let profile_name = self
            .active_profile
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No active profile to save to"))?;

        self.settings_manager
            .save_profile_settings(profile_name, &self.config)
            .with_context(|| format!("Failed to save profile: {}", profile_name))?;

        println!("Settings saved to profile '{}'.", profile_name);
        Ok(())
    }

    /// Get profiles directory path
    fn profiles_path(&self) -> PathBuf {
        self.settings_manager.config_dir_path().join("profiles")
    }
}

/// Parse team string in format "name:member1,member2" or "member1,member2" (auto-generated name)
fn parse_team(team_str: &str) -> Result<StudentTeam> {
    if let Some((name, members_str)) = team_str.split_once(':') {
        let members: Vec<String> = members_str
            .split(',')
            .map(|s| s.trim().to_string())
            .collect();
        Ok(StudentTeam::with_name(name.to_string(), members))
    } else {
        let members: Vec<String> = team_str.split(',').map(|s| s.trim().to_string()).collect();
        Ok(StudentTeam::new(members))
    }
}

/// Load teams from a JSON or YAML file
fn load_teams_from_file(path: &PathBuf) -> Result<Vec<StudentTeam>> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("Failed to read teams file: {}", path.display()))?;

    // Try JSON first, then YAML
    let teams: Vec<StudentTeam> = serde_json::from_str(&content)
        .or_else(|_| serde_yaml::from_str(&content))
        .with_context(|| "Failed to parse teams file (tried JSON and YAML)")?;

    Ok(teams)
}

async fn run_setup(
    config: &ProfileSettings,
    platform: Option<PlatformType>,
    templates: Vec<String>,
    teams_file: Option<PathBuf>,
    team_strings: Vec<String>,
    work_dir: Option<PathBuf>,
    private: Option<bool>,
) -> Result<()> {
    // Load student teams
    let yaml_path = if let Some(file) = teams_file {
        file
    } else if !config.repo.yaml_file.is_empty() {
        PathBuf::from(&config.repo.yaml_file)
    } else if !team_strings.is_empty() {
        // Use team strings directly
        PathBuf::new()
    } else {
        anyhow::bail!("No student teams specified. Use --yaml-file, --teams-file, or --team");
    };

    let student_teams = if yaml_path.as_os_str().is_empty() {
        // Parse from --team arguments
        team_strings
            .iter()
            .map(|s| parse_team(s))
            .collect::<Result<Vec<_>>>()?
    } else {
        load_teams_from_file(&yaml_path)?
    };

    println!("RepoBee Setup");
    println!("=============");
    println!("Platform: {:?}", platform);
    println!("Organization: {}", config.repo.student_repos_group);
    println!("Templates: {:?}", templates);
    println!("Teams: {}", student_teams.len());
    println!();

    // Determine platform
    let platform_type = platform.unwrap_or(PlatformType::GitLab);
    let base_url = &config.common.git_base_url;
    let token = &config.common.git_access_token;
    let org = &config.repo.student_repos_group;
    let user = &config.common.git_user;

    // Create platform instance
    let api = match platform_type {
        PlatformType::GitHub => {
            if token.is_empty() {
                anyhow::bail!("Token required for GitHub. Set with --git-token or REPOBEE_TOKEN");
            }
            Platform::github(base_url.clone(), token.clone(), org.clone(), user.clone())?
        }
        PlatformType::GitLab => {
            if token.is_empty() {
                anyhow::bail!("Token required for GitLab. Set with --git-token or REPOBEE_TOKEN");
            }
            Platform::gitlab(base_url.clone(), token.clone(), org.clone(), user.clone())?
        }
        PlatformType::Gitea => {
            if token.is_empty() {
                anyhow::bail!("Token required for Gitea. Set with --git-token or REPOBEE_TOKEN");
            }
            Platform::gitea(base_url.clone(), token.clone(), org.clone(), user.clone())?
        }
        PlatformType::Local => Platform::local(PathBuf::from(base_url), org.clone(), user.clone())?,
    };

    // Verify settings
    println!("Verifying platform settings...");
    api.verify_settings()
        .await
        .context("Failed to verify platform settings")?;
    println!("✓ Platform settings verified\n");

    // Determine work directory
    let work_dir_path = work_dir.unwrap_or_else(|| PathBuf::from("./repobee-work"));

    // Create work directory
    std::fs::create_dir_all(&work_dir_path).with_context(|| {
        format!(
            "Failed to create work directory: {}",
            work_dir_path.display()
        )
    })?;

    // Run setup
    let result = setup_student_repos(
        &templates,
        &student_teams,
        &api,
        &work_dir_path,
        private.unwrap_or(true),
        Some(token.as_str()),
    )
    .await?;

    // Print summary
    println!("\n=== Final Summary ===");
    println!(
        "✓ Successfully created: {} repositories",
        result.successful_repos.len()
    );
    if !result.existing_repos.is_empty() {
        println!(
            "  Already existed: {} repositories",
            result.existing_repos.len()
        );
    }
    if !result.errors.is_empty() {
        println!("✗ Errors: {} repositories", result.errors.len());
        for error in &result.errors {
            eprintln!(
                "  - {}/{}: {}",
                error.team_name, error.repo_name, error.error
            );
        }
    }

    if result.is_success() {
        println!("\n🎉 Setup completed successfully!");
        Ok(())
    } else {
        anyhow::bail!("Setup completed with {} errors", result.errors.len());
    }
}

async fn run_verify(config: &ProfileSettings, platform: Option<PlatformType>) -> Result<()> {
    println!("Verifying platform settings...");
    println!("Platform: {:?}", platform);
    println!("Organization: {}", config.repo.student_repos_group);
    println!();

    let platform_type = platform.unwrap_or(PlatformType::GitLab);
    let base_url = &config.common.git_base_url;
    let token = &config.common.git_access_token;
    let org = &config.repo.student_repos_group;
    let user = &config.common.git_user;

    let api = match platform_type {
        PlatformType::GitHub => {
            Platform::github(base_url.clone(), token.clone(), org.clone(), user.clone())?
        }
        PlatformType::GitLab => {
            Platform::gitlab(base_url.clone(), token.clone(), org.clone(), user.clone())?
        }
        PlatformType::Gitea => {
            Platform::gitea(base_url.clone(), token.clone(), org.clone(), user.clone())?
        }
        PlatformType::Local => Platform::local(PathBuf::from(base_url), org.clone(), user.clone())?,
    };

    api.verify_settings().await?;
    println!("✓ Verification successful!");
    println!("  Can access organization: {}", api.org_name());

    Ok(())
}

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

    // Load configuration from specific file if requested
    if let Some(ref load_path) = cli.load {
        config_mgr.load(load_path)?;
    }

    // Reset configuration if requested
    if cli.reset {
        config_mgr.reset();
    }

    // Apply CLI overrides
    config_mgr.apply_overrides(&cli);

    // Handle show settings
    if cli.show {
        config_mgr.show();
        return Ok(());
    }

    // If no command was provided, error
    let Some(ref command) = cli.command else {
        anyhow::bail!("No command specified. Use --help to see available commands or --show to display current settings");
    };

    // Handle settings subcommand
    if let Commands::Settings { action } = command {
        match action {
            SettingsAction::Show => {
                config_mgr.show();
                return Ok(());
            }
            SettingsAction::Reset => {
                config_mgr.reset();
                if cli.save {
                    config_mgr.save_to_active_profile()?;
                } else if let Some(ref path) = cli.save_as {
                    config_mgr.save_to_path(path)?;
                } else {
                    println!("Warning: This command has no effect without --save or --save-as.");
                }
                return Ok(());
            }
            SettingsAction::Save => {
                config_mgr.save_to_active_profile()?;
                return Ok(());
            }
        }
    }

    // Handle profile subcommand
    if let Commands::Profile { action } = command {
        match action {
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
                return Ok(());
            }
            ProfileAction::Active => {
                match config_mgr.get_active_profile() {
                    Some(name) => println!("Active profile: {}", name),
                    None => println!("No active profile"),
                }
                return Ok(());
            }
            ProfileAction::Location => {
                println!(
                    "Profiles directory: {}",
                    config_mgr.profiles_path().display()
                );
                return Ok(());
            }
            ProfileAction::Activate { name } => {
                config_mgr.activate_profile(name)?;
                return Ok(());
            }
            ProfileAction::New { name } => {
                config_mgr.create_profile(name)?;
                return Ok(());
            }
            ProfileAction::Delete { name } => {
                config_mgr.delete_profile(name)?;
                return Ok(());
            }
            ProfileAction::Rename { old_name, new_name } => {
                config_mgr.rename_profile(old_name, new_name)?;
                return Ok(());
            }
        }
    }

    // Execute main command
    let result = match command {
        Commands::Setup {
            platform,
            templates,
            teams_file,
            work_dir,
            private,
            teams,
        } => {
            run_setup(
                config_mgr.config(),
                *platform,
                templates.clone(),
                teams_file.clone(),
                teams.clone(),
                work_dir.clone(),
                *private,
            )
            .await
        }
        Commands::Verify { platform } => run_verify(config_mgr.config(), *platform).await,
        Commands::Clone { .. } => {
            anyhow::bail!("Clone command not yet implemented")
        }
        Commands::Settings { .. } => {
            // Already handled above
            Ok(())
        }
        Commands::Profile { .. } => {
            // Already handled above
            Ok(())
        }
    };

    // Save settings if requested (after successful execution)
    if result.is_ok() {
        if let Some(ref save_as_path) = cli.save_as {
            config_mgr.save_to_path(save_as_path)?;
        } else if cli.save {
            config_mgr.save_to_active_profile()?;
        }
    }

    result
}
