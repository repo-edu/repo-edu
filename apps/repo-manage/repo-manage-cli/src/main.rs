//! RepoBee CLI - Command-line interface for RepoBee
//!
//! This CLI provides commands for managing student repositories across
//! GitHub, GitLab, Gitea, and local filesystem platforms.

use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use repo_manage_core::{
    setup_student_repos, CommonSettings, GuiSettings, Platform, PlatformAPI, SettingsManager,
    StudentTeam,
};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "repobee")]
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
}

#[derive(Subcommand)]
enum SettingsAction {
    /// Show current settings
    Show,

    /// Show settings file path
    Path,

    /// Reset settings to defaults
    Reset,

    /// Export settings to a file
    Export {
        /// Output file path
        #[arg(value_name = "PATH")]
        path: PathBuf,
    },

    /// Import settings from a file
    Import {
        /// Input file path
        #[arg(value_name = "PATH")]
        path: PathBuf,
    },
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
    config: CommonSettings,
}

impl ConfigManager {
    /// Create a new configuration manager
    fn new() -> Result<Self> {
        let settings_manager =
            SettingsManager::new().context("Failed to create settings manager")?;

        // Load configuration or use defaults
        let gui_settings = settings_manager.load().unwrap_or_default();
        let config = gui_settings.common;

        Ok(Self {
            settings_manager,
            config,
        })
    }

    /// Apply CLI overrides to configuration
    fn apply_overrides(&mut self, cli: &Cli) {
        // Override git settings
        if let Some(ref url) = cli.git_base_url {
            self.config.git_base_url = url.clone();
        }
        if let Some(ref token) = cli.git_token {
            self.config.git_access_token = token.clone();
        }
        if let Some(ref user) = cli.git_user {
            self.config.git_user = user.clone();
        }
        if let Some(ref org) = cli.student_org {
            self.config.git_student_repos_group = org.clone();
        }
        if let Some(ref org) = cli.template_org {
            self.config.git_template_group = org.clone();
        }

        // Override file settings
        if let Some(ref yaml) = cli.yaml_file {
            self.config.yaml_file = yaml.to_string_lossy().to_string();
        }
        if let Some(ref folder) = cli.target_folder {
            self.config.target_folder = folder.to_string_lossy().to_string();
        }
        if let Some(ref assignments) = cli.assignments {
            self.config.assignments = assignments.clone();
        }
        if let Some(ref layout) = cli.directory_layout {
            self.config.directory_layout = layout.parse().unwrap_or_default();
        }
    }

    /// Save configuration
    fn save(&self, path: Option<&PathBuf>) -> Result<()> {
        let gui_settings = repo_manage_core::GuiSettings::from_common(self.config.clone());

        if let Some(path) = path {
            self.settings_manager
                .save_to(&gui_settings, path)
                .context("Failed to save settings")?;
            println!("Settings saved to: {}", path.display());
        } else {
            self.settings_manager
                .save(&gui_settings)
                .context("Failed to save settings")?;
            println!(
                "Settings saved to: {}",
                self.settings_manager.settings_file_path().display()
            );
        }

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

        self.config = gui_settings.common;
        println!("Settings loaded from: {}", path.display());
        Ok(())
    }

    /// Reset configuration to defaults
    fn reset(&mut self) -> Result<()> {
        self.config = CommonSettings::default();
        let gui_settings = repo_manage_core::GuiSettings::from_common(self.config.clone());
        self.settings_manager
            .save(&gui_settings)
            .context("Failed to reset settings")?;
        println!("Settings reset to defaults");
        Ok(())
    }

    /// Show current configuration
    fn show(&self) {
        println!("Current Configuration:");
        println!("======================");
        println!();
        println!("Git Settings:");
        println!("  Base URL        : {}", self.config.git_base_url);
        println!("  User            : {}", self.config.git_user);
        println!(
            "  Student Org     : {}",
            self.config.git_student_repos_group
        );
        println!("  Template Org    : {}", self.config.git_template_group);
        println!("  Token           : {}", if self.config.git_access_token.is_empty() { "(not set)" } else { "***" });
        println!();
        println!("Repository Settings:");
        println!("  YAML File       : {}", self.config.yaml_file);
        println!("  Target Folder   : {}", self.config.target_folder);
        println!("  Assignments     : {}", self.config.assignments);
        println!("  Directory Layout: {}", self.config.directory_layout);
        println!();
        println!("Settings File:");
        println!(
            "  Location        : {}",
            self.settings_manager.settings_file_path().display()
        );
    }

    /// Get configuration
    fn config(&self) -> &CommonSettings {
        &self.config
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
    config: &CommonSettings,
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
    } else if !config.yaml_file.is_empty() {
        PathBuf::from(&config.yaml_file)
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
    println!("Organization: {}", config.git_student_repos_group);
    println!("Templates: {:?}", templates);
    println!("Teams: {}", student_teams.len());
    println!();

    // Determine platform
    let platform_type = platform.unwrap_or(PlatformType::GitLab);
    let base_url = &config.git_base_url;
    let token = &config.git_access_token;
    let org = &config.git_student_repos_group;
    let user = &config.git_user;

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

async fn run_verify(config: &CommonSettings, platform: Option<PlatformType>) -> Result<()> {
    println!("Verifying platform settings...");
    println!("Platform: {:?}", platform);
    println!("Organization: {}", config.git_student_repos_group);
    println!();

    let platform_type = platform.unwrap_or(PlatformType::GitLab);
    let base_url = &config.git_base_url;
    let token = &config.git_access_token;
    let org = &config.git_student_repos_group;
    let user = &config.git_user;

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

    // Create configuration manager
    let mut config_mgr = ConfigManager::new()?;

    // Load configuration from specific file if requested
    if let Some(ref load_path) = cli.load {
        config_mgr.load(load_path)?;
    }

    // Reset configuration if requested
    if cli.reset {
        config_mgr.reset()?;
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
            SettingsAction::Path => {
                println!(
                    "Settings file: {}",
                    config_mgr.settings_manager.settings_file_path().display()
                );
                return Ok(());
            }
            SettingsAction::Reset => {
                config_mgr.reset()?;
                return Ok(());
            }
            SettingsAction::Export { path } => {
                config_mgr.save(Some(path))?;
                return Ok(());
            }
            SettingsAction::Import { path } => {
                config_mgr.load(path)?;
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
    };

    // Save settings if requested (after successful execution)
    if result.is_ok() {
        if let Some(ref save_as_path) = cli.save_as {
            config_mgr.save(Some(save_as_path))?;
        } else if cli.save {
            config_mgr.save(None)?;
        }
    }

    result
}
