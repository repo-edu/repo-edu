use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

/// LMS URL preset options
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "UPPERCASE")]
pub enum LmsUrlOption {
    TUE,
    Custom,
}

impl Default for LmsUrlOption {
    fn default() -> Self {
        Self::TUE
    }
}

impl fmt::Display for LmsUrlOption {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TUE => write!(f, "TUE"),
            Self::Custom => write!(f, "Custom"),
        }
    }
}

impl FromStr for LmsUrlOption {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "TUE" => Ok(Self::TUE),
            "CUSTOM" => Ok(Self::Custom),
            _ => Err(format!("Unknown LMS URL option: {}", s)),
        }
    }
}

/// Member option for YAML generation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum MemberOption {
    #[serde(rename = "(email, gitid)")]
    EmailAndGitId,
    #[serde(rename = "email")]
    Email,
    #[serde(rename = "git_id")]
    GitId,
}

impl Default for MemberOption {
    fn default() -> Self {
        Self::EmailAndGitId
    }
}

impl fmt::Display for MemberOption {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmailAndGitId => write!(f, "(email, gitid)"),
            Self::Email => write!(f, "email"),
            Self::GitId => write!(f, "git_id"),
        }
    }
}

impl FromStr for MemberOption {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "(email, gitid)" | "email_and_gitid" => Ok(Self::EmailAndGitId),
            "email" => Ok(Self::Email),
            "git_id" | "gitid" => Ok(Self::GitId),
            _ => Err(format!("Unknown member option: {}", s)),
        }
    }
}

/// Directory layout for cloned repositories
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum DirectoryLayout {
    ByTeam,
    Flat,
    ByTask,
}

impl Default for DirectoryLayout {
    fn default() -> Self {
        Self::Flat
    }
}

impl fmt::Display for DirectoryLayout {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ByTeam => write!(f, "by-team"),
            Self::Flat => write!(f, "flat"),
            Self::ByTask => write!(f, "by-task"),
        }
    }
}

impl FromStr for DirectoryLayout {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "by-team" | "by_team" | "byteam" => Ok(Self::ByTeam),
            "flat" => Ok(Self::Flat),
            "by-task" | "by_task" | "bytask" => Ok(Self::ByTask),
            _ => Err(format!("Unknown directory layout: {}", s)),
        }
    }
}

/// Active tab in the GUI
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ActiveTab {
    Lms,
    Repo,
}

impl Default for ActiveTab {
    fn default() -> Self {
        Self::Lms
    }
}

impl fmt::Display for ActiveTab {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Lms => write!(f, "lms"),
            Self::Repo => write!(f, "repo"),
        }
    }
}

impl FromStr for ActiveTab {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "lms" => Ok(Self::Lms),
            "repo" => Ok(Self::Repo),
            _ => Err(format!("Unknown active tab: {}", s)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lms_url_option_display() {
        assert_eq!(LmsUrlOption::TUE.to_string(), "TUE");
        assert_eq!(LmsUrlOption::Custom.to_string(), "Custom");
    }

    #[test]
    fn test_lms_url_option_from_str() {
        assert_eq!("TUE".parse::<LmsUrlOption>().unwrap(), LmsUrlOption::TUE);
        assert_eq!("tue".parse::<LmsUrlOption>().unwrap(), LmsUrlOption::TUE);
        assert_eq!("CUSTOM".parse::<LmsUrlOption>().unwrap(), LmsUrlOption::Custom);
        assert_eq!("custom".parse::<LmsUrlOption>().unwrap(), LmsUrlOption::Custom);
    }

    #[test]
    fn test_member_option_display() {
        assert_eq!(MemberOption::EmailAndGitId.to_string(), "(email, gitid)");
        assert_eq!(MemberOption::Email.to_string(), "email");
        assert_eq!(MemberOption::GitId.to_string(), "git_id");
    }

    #[test]
    fn test_member_option_from_str() {
        assert_eq!(
            "(email, gitid)".parse::<MemberOption>().unwrap(),
            MemberOption::EmailAndGitId
        );
        assert_eq!("email".parse::<MemberOption>().unwrap(), MemberOption::Email);
        assert_eq!("git_id".parse::<MemberOption>().unwrap(), MemberOption::GitId);
    }

    #[test]
    fn test_directory_layout_display() {
        assert_eq!(DirectoryLayout::ByTeam.to_string(), "by-team");
        assert_eq!(DirectoryLayout::Flat.to_string(), "flat");
        assert_eq!(DirectoryLayout::ByTask.to_string(), "by-task");
    }

    #[test]
    fn test_directory_layout_from_str() {
        assert_eq!(
            "by-team".parse::<DirectoryLayout>().unwrap(),
            DirectoryLayout::ByTeam
        );
        assert_eq!("flat".parse::<DirectoryLayout>().unwrap(), DirectoryLayout::Flat);
        assert_eq!(
            "by-task".parse::<DirectoryLayout>().unwrap(),
            DirectoryLayout::ByTask
        );
    }

    #[test]
    fn test_active_tab_serialize() {
        let json = serde_json::to_string(&ActiveTab::Lms).unwrap();
        assert_eq!(json, "\"lms\"");

        let json = serde_json::to_string(&ActiveTab::Repo).unwrap();
        assert_eq!(json, "\"repo\"");
    }

    #[test]
    fn test_active_tab_deserialize() {
        let tab: ActiveTab = serde_json::from_str("\"lms\"").unwrap();
        assert_eq!(tab, ActiveTab::Lms);

        let tab: ActiveTab = serde_json::from_str("\"repo\"").unwrap();
        assert_eq!(tab, ActiveTab::Repo);
    }
}
