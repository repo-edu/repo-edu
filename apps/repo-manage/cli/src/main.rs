//! Repo Edu CLI - Command-line interface for repo-edu.

mod commands;
mod output;
mod util;

use clap::{CommandFactory, Parser, Subcommand};

#[derive(Parser)]
#[command(name = "redu")]
#[command(about = "Repository management for education")]
#[command(version)]
pub struct Cli {
    /// Profile to use (default: active profile)
    #[arg(long, global = true)]
    pub profile: Option<String>,

    /// Print complete CLI documentation as markdown
    #[arg(long)]
    pub markdown_help: bool,

    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Profile management
    Profile {
        #[command(subcommand)]
        action: ProfileAction,
    },

    /// Show roster information
    Roster {
        #[command(subcommand)]
        action: RosterAction,
    },

    /// LMS operations
    Lms {
        #[command(subcommand)]
        action: LmsAction,
    },

    /// Git platform operations
    Git {
        #[command(subcommand)]
        action: GitAction,
    },

    /// Repository operations
    Repo {
        #[command(subcommand)]
        action: RepoAction,
    },

    /// Validate assignment readiness
    Validate {
        /// Assignment name
        #[arg(long, required = true)]
        assignment: String,
    },
}

#[derive(Subcommand)]
pub enum ProfileAction {
    /// List all profiles
    List,
    /// Show active profile name
    Active,
    /// Show active profile settings
    Show,
    /// Set active profile
    Load {
        /// Profile name to activate
        name: String,
    },
}

#[derive(Subcommand)]
pub enum RosterAction {
    /// Show roster summary and details
    Show {
        /// Include student list
        #[arg(long)]
        students: bool,

        /// Include assignment/group details
        #[arg(long)]
        assignments: bool,
    },
}

#[derive(Subcommand)]
pub enum LmsAction {
    /// Verify LMS connection
    Verify,

    /// Import students from LMS
    ImportStudents,

    /// Import groups from LMS group-set
    ImportGroups {
        /// Target assignment name
        #[arg(long, required = true)]
        assignment: String,

        /// LMS group-set ID (prompts if omitted)
        #[arg(long)]
        group_set: Option<String>,
    },
}

#[derive(Subcommand)]
pub enum GitAction {
    /// Verify git platform connection
    Verify,
}

#[derive(Subcommand)]
pub enum RepoAction {
    /// Create repositories for assignment groups
    Create {
        /// Assignment name
        #[arg(long, required = true)]
        assignment: String,

        /// Show what would be created without executing
        #[arg(long)]
        dry_run: bool,
    },

    /// Clone repositories for assignment groups
    Clone {
        /// Assignment name
        #[arg(long, required = true)]
        assignment: String,

        /// Target directory (default: current directory)
        #[arg(long)]
        target: Option<String>,

        /// Directory layout: flat, by-team, by-task
        #[arg(long)]
        layout: Option<String>,
    },

    /// Delete repositories for assignment groups
    Delete {
        /// Assignment name
        #[arg(long, required = true)]
        assignment: String,

        /// Skip confirmation prompt
        #[arg(long)]
        force: bool,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    if cli.markdown_help {
        let markdown = clap_markdown::help_markdown::<Cli>();
        println!("{markdown}");
        return Ok(());
    }

    let profile = cli.profile.clone();
    let Some(command) = cli.command else {
        Cli::command().print_help()?;
        println!();
        return Ok(());
    };

    match command {
        Commands::Profile { action } => match action {
            ProfileAction::List => commands::profile::list()?,
            ProfileAction::Active => commands::profile::active()?,
            ProfileAction::Show => commands::profile::show()?,
            ProfileAction::Load { name } => commands::profile::load(name)?,
        },

        Commands::Roster { action } => match action {
            RosterAction::Show {
                students,
                assignments,
            } => commands::roster::show(profile, students, assignments)?,
        },

        Commands::Lms { action } => match action {
            LmsAction::Verify => commands::lms::verify(profile).await?,
            LmsAction::ImportStudents => commands::lms::import_students(profile).await?,
            LmsAction::ImportGroups {
                assignment,
                group_set,
            } => commands::lms::import_groups(profile, assignment, group_set).await?,
        },

        Commands::Git { action } => match action {
            GitAction::Verify => commands::git::verify(profile).await?,
        },

        Commands::Repo { action } => match action {
            RepoAction::Create {
                assignment,
                dry_run,
            } => commands::repo::create(profile, assignment, dry_run).await?,
            RepoAction::Clone {
                assignment,
                target,
                layout,
            } => commands::repo::clone(profile, assignment, target, layout).await?,
            RepoAction::Delete { assignment, force } => {
                commands::repo::delete(profile, assignment, force).await?
            }
        },

        Commands::Validate { assignment } => {
            commands::validate::validate_assignment(profile, assignment)?
        }
    }

    Ok(())
}
