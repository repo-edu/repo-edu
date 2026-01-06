use crate::generated::types::{
    DateFormat, DirectoryLayout, GitServerType, MemberOption, Theme, TimeFormat,
};
use std::fmt;
use std::str::FromStr;

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

impl fmt::Display for Theme {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Light => write!(f, "light"),
            Self::Dark => write!(f, "dark"),
            Self::System => write!(f, "system"),
        }
    }
}

impl FromStr for Theme {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "light" => Ok(Self::Light),
            "dark" => Ok(Self::Dark),
            "system" => Ok(Self::System),
            _ => Err(format!("Unknown theme: {}", s)),
        }
    }
}

impl fmt::Display for DateFormat {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MDY => write!(f, "MDY"),
            Self::DMY => write!(f, "DMY"),
        }
    }
}

impl FromStr for DateFormat {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "MDY" => Ok(Self::MDY),
            "DMY" => Ok(Self::DMY),
            _ => Err(format!("Unknown date format: {}", s)),
        }
    }
}

impl fmt::Display for TimeFormat {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TwelveHour => write!(f, "12h"),
            Self::TwentyFourHour => write!(f, "24h"),
        }
    }
}

impl FromStr for TimeFormat {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "12h" => Ok(Self::TwelveHour),
            "24h" => Ok(Self::TwentyFourHour),
            _ => Err(format!("Unknown time format: {}", s)),
        }
    }
}

impl fmt::Display for GitServerType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::GitHub => write!(f, "GitHub"),
            Self::GitLab => write!(f, "GitLab"),
            Self::Gitea => write!(f, "Gitea"),
        }
    }
}

impl FromStr for GitServerType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "github" => Ok(Self::GitHub),
            "gitlab" => Ok(Self::GitLab),
            "gitea" => Ok(Self::Gitea),
            _ => Err(format!("Unknown git server type: {}", s)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(
            "email".parse::<MemberOption>().unwrap(),
            MemberOption::Email
        );
        assert_eq!(
            "git_id".parse::<MemberOption>().unwrap(),
            MemberOption::GitId
        );
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
        assert_eq!(
            "flat".parse::<DirectoryLayout>().unwrap(),
            DirectoryLayout::Flat
        );
        assert_eq!(
            "by-task".parse::<DirectoryLayout>().unwrap(),
            DirectoryLayout::ByTask
        );
    }

    fn test_git_server_type_display() {
        assert_eq!(GitServerType::GitHub.to_string(), "GitHub");
        assert_eq!(GitServerType::GitLab.to_string(), "GitLab");
        assert_eq!(GitServerType::Gitea.to_string(), "Gitea");
    }

    #[test]
    fn test_git_server_type_from_str() {
        assert_eq!(
            "github".parse::<GitServerType>().unwrap(),
            GitServerType::GitHub
        );
        assert_eq!(
            "GitLab".parse::<GitServerType>().unwrap(),
            GitServerType::GitLab
        );
        assert_eq!(
            "GITEA".parse::<GitServerType>().unwrap(),
            GitServerType::Gitea
        );
    }

    #[test]
    fn test_git_server_type_serialization() {
        let json = serde_json::to_string(&GitServerType::GitHub).unwrap();
        assert_eq!(json, "\"GitHub\"");

        let json = serde_json::to_string(&GitServerType::GitLab).unwrap();
        assert_eq!(json, "\"GitLab\"");
    }

    #[test]
    fn test_git_server_type_deserialization() {
        let server: GitServerType = serde_json::from_str("\"GitHub\"").unwrap();
        assert_eq!(server, GitServerType::GitHub);

        let server: GitServerType = serde_json::from_str("\"GitLab\"").unwrap();
        assert_eq!(server, GitServerType::GitLab);

        let server: GitServerType = serde_json::from_str("\"Gitea\"").unwrap();
        assert_eq!(server, GitServerType::Gitea);
    }
}
