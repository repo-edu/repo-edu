//! RepoBee CLI - Command-line interface for RepoBee
//!
//! This CLI provides commands for managing student repositories across
//! GitHub, GitLab, Gitea, and local filesystem platforms, as well as
//! LMS integration for Canvas and Moodle.

use anyhow::{Context, Result};
use clap::{CommandFactory, Parser, Subcommand, ValueEnum};
use repo_manage_core::{
    generate_lms_files, setup_repos, verify_lms_course, verify_platform, GenerateLmsFilesParams,
    PlatformType as CorePlatformType, ProfileSettings, ProgressEvent, SettingsManager,
    SetupParams as CoreSetupParams, StudentTeam, VerifyLmsParams, VerifyParams,
};
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
enum PlatformType {
    GitHub,
    GitLab,
    Gitea,
    Local,
}

impl From<PlatformType> for CorePlatformType {
    fn from(p: PlatformType) -> Self {
        match p {
            PlatformType::GitHub => CorePlatformType::GitHub,
            PlatformType::GitLab => CorePlatformType::GitLab,
            PlatformType::Gitea => CorePlatformType::Gitea,
            PlatformType::Local => CorePlatformType::Local,
        }
    }
}

/// CLI progress handler - prints progress events to stdout/stderr
fn cli_progress(event: ProgressEvent) {
    match event {
        ProgressEvent::Status(msg) => println!("{}", msg),
        ProgressEvent::Inline(msg) => print!("\r{}", msg),
        ProgressEvent::Started { operation } => println!("Starting: {}", operation),
        ProgressEvent::Completed { operation, details } => {
            println!("✓ {}", operation);
            if let Some(d) = details {
                println!("  {}", d);
            }
        }
        ProgressEvent::Failed { operation, error } => {
            eprintln!("✗ {}: {}", operation, error);
        }
        ProgressEvent::Progress {
            current,
            total,
            message,
        } => {
            println!("[{}/{}] {}", current, total, message);
        }
    }
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
        println!(
            "  Access Token    : {}",
            if self.config.lms.access_token.is_empty() {
                "(not set)"
            } else {
                "***"
            }
        );
        println!("  Output Folder   : {}", self.config.lms.output_folder);
        println!("  Output YAML     : {}", self.config.lms.output_yaml);
        println!("  Output CSV      : {}", self.config.lms.output_csv);
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

// ===== LMS Command Handlers =====

struct LmsVerifyOverrides {
    lms_type: Option<String>,
    course_id: Option<String>,
}

async fn run_lms_verify(config: &ProfileSettings, overrides: LmsVerifyOverrides) -> Result<()> {
    let params = VerifyLmsParams {
        lms_type: overrides
            .lms_type
            .unwrap_or_else(|| config.lms.r#type.clone()),
        base_url: config.lms.base_url.clone(),
        access_token: config.lms.access_token.clone(),
        course_id: overrides
            .course_id
            .unwrap_or_else(|| config.lms.course_id.clone()),
    };

    if params.access_token.is_empty() {
        anyhow::bail!("LMS access token not set. Configure in GUI or set in profile.");
    }
    if params.course_id.is_empty() {
        anyhow::bail!("Course ID not set. Use --course-id or configure in profile.");
    }

    let result = verify_lms_course(&params, cli_progress)
        .await
        .context("LMS verification failed")?;

    println!(
        "\n✓ {} course verified: {}",
        params.lms_type, result.course_name
    );
    println!("  Course ID: {}", result.course_id);
    if let Some(code) = result.course_code {
        println!("  Course Code: {}", code);
    }

    Ok(())
}

struct LmsGenerateOverrides {
    output: Option<String>,
    yaml: Option<bool>,
    csv: Option<bool>,
}

async fn run_lms_generate(config: &ProfileSettings, overrides: LmsGenerateOverrides) -> Result<()> {
    let output_folder = overrides
        .output
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(&config.lms.output_folder));

    if output_folder.as_os_str().is_empty() {
        anyhow::bail!("Output folder not set. Use --output or configure in profile.");
    }

    let params = GenerateLmsFilesParams {
        lms_type: config.lms.r#type.clone(),
        base_url: config.lms.base_url.clone(),
        access_token: config.lms.access_token.clone(),
        course_id: config.lms.course_id.clone(),
        output_folder,
        yaml: overrides.yaml.unwrap_or(config.lms.output_yaml),
        yaml_file: config.lms.yaml_file.clone(),
        csv: overrides.csv.unwrap_or(config.lms.output_csv),
        csv_file: config.lms.csv_file.clone(),
        member_option: config.lms.member_option.to_string(),
        include_group: config.lms.include_group,
        include_member: config.lms.include_member,
        include_initials: config.lms.include_initials,
        full_groups: config.lms.full_groups,
    };

    if params.access_token.is_empty() {
        anyhow::bail!("LMS access token not set.");
    }
    if params.course_id.is_empty() {
        anyhow::bail!("Course ID not set.");
    }

    let result = generate_lms_files(&params, cli_progress)
        .await
        .context("Failed to generate LMS files")?;

    println!(
        "\n✓ Generated {} file(s) from {} students",
        result.generated_files.len(),
        result.student_count
    );
    for file in &result.generated_files {
        println!("  {}", file);
    }

    Ok(())
}

// ===== Repo Command Handlers =====

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

async fn run_repo_verify(config: &ProfileSettings, platform: Option<PlatformType>) -> Result<()> {
    println!("Verifying platform settings...");
    println!("Platform: {:?}", platform);
    println!("Organization: {}", config.repo.student_repos_group);
    println!();

    let params = VerifyParams {
        platform_type: platform.map(|p| p.into()),
        base_url: config.common.git_base_url.clone(),
        access_token: config.common.git_access_token.clone(),
        organization: config.repo.student_repos_group.clone(),
        user: config.common.git_user.clone(),
    };

    verify_platform(&params, cli_progress)
        .await
        .context("Verification failed")?;

    Ok(())
}

async fn run_repo_setup(
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

    // Check token for non-local platforms
    let platform_type = platform.map(|p| p.into());
    let needs_token = platform_type
        .map(|p| p != CorePlatformType::Local)
        .unwrap_or(true);

    if needs_token && config.common.git_access_token.is_empty() {
        anyhow::bail!("Token required. Set with --git-token or REPOBEE_TOKEN");
    }

    // Determine work directory
    let work_dir_path = work_dir.unwrap_or_else(|| PathBuf::from("./repobee-work"));

    // Build setup params
    let params = CoreSetupParams {
        platform_type,
        base_url: config.common.git_base_url.clone(),
        access_token: config.common.git_access_token.clone(),
        organization: config.repo.student_repos_group.clone(),
        user: config.common.git_user.clone(),
        template_org: if config.repo.template_group.is_empty() {
            None
        } else {
            Some(config.repo.template_group.clone())
        },
        templates,
        student_teams,
        work_dir: work_dir_path,
        private: private.unwrap_or(true),
    };

    let result = setup_repos(&params, cli_progress)
        .await
        .context("Setup failed")?;

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
        Commands::Lms { action } => match action {
            LmsAction::Verify {
                lms_type,
                course_id,
            } => {
                run_lms_verify(
                    config_mgr.config(),
                    LmsVerifyOverrides {
                        lms_type,
                        course_id,
                    },
                )
                .await
            }
            LmsAction::Generate { output, yaml, csv } => {
                run_lms_generate(
                    config_mgr.config(),
                    LmsGenerateOverrides { output, yaml, csv },
                )
                .await
            }
        },
        Commands::Repo { action } => match action {
            RepoAction::Verify { platform } => run_repo_verify(config_mgr.config(), platform).await,
            RepoAction::Setup {
                platform,
                templates,
                teams_file,
                work_dir,
                private,
                teams,
            } => {
                run_repo_setup(
                    config_mgr.config(),
                    platform,
                    templates,
                    teams_file,
                    teams,
                    work_dir,
                    private,
                )
                .await
            }
            RepoAction::Clone { .. } => {
                anyhow::bail!("Clone command not yet implemented")
            }
        },
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
