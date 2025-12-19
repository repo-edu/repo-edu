//! Platform factory for unified platform creation across CLI and GUI

use crate::error::Result;
use crate::platform::Platform;
use crate::PlatformError;
use std::path::PathBuf;

/// Platform types supported by the application
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlatformType {
    GitHub,
    GitLab,
    Gitea,
    Local,
}

impl PlatformType {
    /// Detect platform type from a base URL
    pub fn detect(url: &str) -> Option<Self> {
        let url_lower = url.to_lowercase();
        if url_lower.starts_with('/') || url_lower.starts_with("file://") {
            Some(Self::Local)
        } else if url_lower.contains("github") {
            Some(Self::GitHub)
        } else if url_lower.contains("gitlab") {
            Some(Self::GitLab)
        } else if url_lower.contains("gitea") {
            Some(Self::Gitea)
        } else {
            None
        }
    }
}

/// Parameters for creating a platform instance
#[derive(Debug, Clone)]
pub struct PlatformParams {
    pub base_url: String,
    pub access_token: String,
    pub organization: String,
    pub user: String,
}

/// Create a platform instance from parameters
///
/// If `platform_type` is None, attempts to detect from `params.base_url`.
pub fn create_platform(
    platform_type: Option<PlatformType>,
    params: &PlatformParams,
) -> Result<Platform> {
    let detected = platform_type
        .or_else(|| PlatformType::detect(&params.base_url))
        .ok_or_else(|| {
            PlatformError::InvalidUrl(
                "Cannot detect platform type from URL. Use explicit --platform flag or include 'github', 'gitlab', or 'gitea' in the URL.".into(),
            )
        })?;

    match detected {
        PlatformType::GitHub => Platform::github(
            params.base_url.clone(),
            params.access_token.clone(),
            params.organization.clone(),
            params.user.clone(),
        ),
        PlatformType::GitLab => Platform::gitlab(
            params.base_url.clone(),
            params.access_token.clone(),
            params.organization.clone(),
            params.user.clone(),
        ),
        PlatformType::Gitea => Platform::gitea(
            params.base_url.clone(),
            params.access_token.clone(),
            params.organization.clone(),
            params.user.clone(),
        ),
        PlatformType::Local => Platform::local(
            PathBuf::from(&params.base_url),
            params.organization.clone(),
            params.user.clone(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_github() {
        assert_eq!(
            PlatformType::detect("https://github.com"),
            Some(PlatformType::GitHub)
        );
        assert_eq!(
            PlatformType::detect("https://api.github.com"),
            Some(PlatformType::GitHub)
        );
    }

    #[test]
    fn test_detect_gitlab() {
        assert_eq!(
            PlatformType::detect("https://gitlab.com"),
            Some(PlatformType::GitLab)
        );
        assert_eq!(
            PlatformType::detect("https://gitlab.example.org"),
            Some(PlatformType::GitLab)
        );
    }

    #[test]
    fn test_detect_gitea() {
        assert_eq!(
            PlatformType::detect("https://gitea.example.org"),
            Some(PlatformType::Gitea)
        );
    }

    #[test]
    fn test_detect_local() {
        assert_eq!(
            PlatformType::detect("/path/to/repos"),
            Some(PlatformType::Local)
        );
        assert_eq!(
            PlatformType::detect("file:///path/to/repos"),
            Some(PlatformType::Local)
        );
    }

    #[test]
    fn test_detect_unknown() {
        assert_eq!(PlatformType::detect("https://example.com"), None);
    }
}
