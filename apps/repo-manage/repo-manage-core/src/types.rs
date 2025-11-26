//! Core domain types for RepoBee

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ============================================================================
// Enums
// ============================================================================

/// Team permission levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TeamPermission {
    /// Read/pull access
    Pull,
    /// Write/push access
    Push,
}

impl TeamPermission {
    /// Convert to platform-specific permission string for GitHub
    pub fn to_github_str(&self) -> &'static str {
        match self {
            Self::Pull => "pull",
            Self::Push => "push",
        }
    }

    /// Convert to platform-specific permission string for GitLab
    pub fn to_gitlab_access_level(&self) -> u32 {
        match self {
            Self::Pull => 20, // REPORTER_ACCESS
            Self::Push => 30, // DEVELOPER_ACCESS
        }
    }

    /// Convert to platform-specific permission string for Gitea
    pub fn to_gitea_str(&self) -> &'static str {
        match self {
            Self::Pull => "read",
            Self::Push => "write",
        }
    }
}

/// Issue states
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IssueState {
    Open,
    Closed,
    All,
}

impl IssueState {
    /// Convert to platform-specific state string for GitHub
    pub fn to_github_str(&self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Closed => "closed",
            Self::All => "all",
        }
    }

    /// Convert to platform-specific state string for GitLab
    pub fn to_gitlab_str(&self) -> &'static str {
        match self {
            Self::Open => "opened",
            Self::Closed => "closed",
            Self::All => "all",
        }
    }

    /// Convert to platform-specific state string for Gitea
    pub fn to_gitea_str(&self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Closed => "closed",
            Self::All => "all",
        }
    }
}

// ============================================================================
// Platform API Response Types (wrappers for platform-specific objects)
// ============================================================================

/// Platform-independent representation of a team
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Team {
    /// Team name
    pub name: String,
    /// Team members (normalized usernames)
    pub members: Vec<String>,
    /// Platform-specific team ID (stored as string for flexibility)
    pub id: String,
}

impl Team {
    pub fn new(name: String, members: Vec<String>, id: String) -> Self {
        Self { name, members, id }
    }
}

/// Platform-independent representation of a repository
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Repo {
    /// Repository name
    pub name: String,
    /// Repository description
    pub description: String,
    /// Whether the repository is private
    pub private: bool,
    /// Repository URL
    pub url: String,
}

impl Repo {
    pub fn new(name: String, description: String, private: bool, url: String) -> Self {
        Self {
            name,
            description,
            private,
            url,
        }
    }
}

/// Platform-independent representation of an issue
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Issue {
    /// Issue title
    pub title: String,
    /// Issue body/description
    pub body: String,
    /// Issue number (if available)
    pub number: Option<u32>,
    /// Creation timestamp (ISO 8601 format)
    pub created_at: Option<String>,
    /// Issue author username
    pub author: Option<String>,
    /// Issue state
    pub state: Option<IssueState>,
}

impl Issue {
    pub fn new(title: String, body: String) -> Self {
        Self {
            title,
            body,
            number: None,
            created_at: None,
            author: None,
            state: None,
        }
    }
}

// ============================================================================
// Local/User-facing Types
// ============================================================================

/// Local representation of a student team
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
pub struct StudentTeam {
    /// Team members (normalized usernames)
    pub members: Vec<String>,
    /// Team name (defaults to members joined by "-" if empty)
    pub name: String,
}

impl StudentTeam {
    /// Create a new student team with the given members
    pub fn new(members: Vec<String>) -> Self {
        let mut sorted_members = members;
        sorted_members.sort();
        let name = sorted_members.join("-");
        Self {
            members: sorted_members,
            name,
        }
    }

    /// Create a new student team with explicit name and members
    pub fn with_name(name: String, members: Vec<String>) -> Self {
        let mut sorted_members = members;
        sorted_members.sort();
        Self {
            name,
            members: sorted_members,
        }
    }
}

/// Local representation of a student repository
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StudentRepo {
    /// Repository name
    pub name: String,
    /// Associated student team
    pub team: StudentTeam,
    /// Repository URL
    pub url: String,
    /// Local path to the repository (if cloned)
    pub path: Option<PathBuf>,
}

impl StudentRepo {
    pub fn new(name: String, team: StudentTeam, url: String) -> Self {
        Self {
            name,
            team,
            url,
            path: None,
        }
    }

    pub fn with_path(mut self, path: PathBuf) -> Self {
        self.path = Some(path);
        self
    }
}

/// Local representation of a template repository
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TemplateRepo {
    /// Repository name
    pub name: String,
    /// Repository URL
    pub url: String,
    /// Local path to the repository (if cloned)
    pub path: Option<PathBuf>,
}

impl TemplateRepo {
    pub fn new(name: String, url: String) -> Self {
        Self {
            name,
            url,
            path: None,
        }
    }

    pub fn with_path(mut self, path: PathBuf) -> Self {
        self.path = Some(path);
        self
    }
}
