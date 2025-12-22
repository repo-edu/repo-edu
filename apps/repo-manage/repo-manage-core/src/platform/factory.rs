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

    // ========================================================================
    // PlatformType::detect Tests
    // ========================================================================

    #[test]
    fn detect_github_from_github_com() {
        assert_eq!(
            PlatformType::detect("https://github.com"),
            Some(PlatformType::GitHub)
        );
    }

    #[test]
    fn detect_github_from_api_github_com() {
        assert_eq!(
            PlatformType::detect("https://api.github.com"),
            Some(PlatformType::GitHub)
        );
    }

    #[test]
    fn detect_github_enterprise() {
        assert_eq!(
            PlatformType::detect("https://github.mycompany.com"),
            Some(PlatformType::GitHub)
        );
    }

    #[test]
    fn detect_gitlab_from_gitlab_com() {
        assert_eq!(
            PlatformType::detect("https://gitlab.com"),
            Some(PlatformType::GitLab)
        );
    }

    #[test]
    fn detect_gitlab_self_hosted() {
        assert_eq!(
            PlatformType::detect("https://gitlab.example.org"),
            Some(PlatformType::GitLab)
        );
        assert_eq!(
            PlatformType::detect("https://gitlab.tue.nl"),
            Some(PlatformType::GitLab)
        );
    }

    #[test]
    fn detect_gitea() {
        assert_eq!(
            PlatformType::detect("https://gitea.example.org"),
            Some(PlatformType::Gitea)
        );
    }

    #[test]
    fn detect_local_absolute_path() {
        assert_eq!(
            PlatformType::detect("/path/to/repos"),
            Some(PlatformType::Local)
        );
    }

    #[test]
    fn detect_local_file_url() {
        assert_eq!(
            PlatformType::detect("file:///path/to/repos"),
            Some(PlatformType::Local)
        );
    }

    #[test]
    fn detect_unknown_returns_none() {
        assert_eq!(PlatformType::detect("https://example.com"), None);
        assert_eq!(PlatformType::detect("https://myserver.org/repos"), None);
    }

    #[test]
    fn detect_is_case_insensitive() {
        assert_eq!(
            PlatformType::detect("https://GITHUB.COM"),
            Some(PlatformType::GitHub)
        );
        assert_eq!(
            PlatformType::detect("https://GitLab.Example.Org"),
            Some(PlatformType::GitLab)
        );
    }

    // ========================================================================
    // create_platform Tests
    // ========================================================================

    #[test]
    fn create_platform_gitlab_detected() {
        let params = PlatformParams {
            base_url: "https://gitlab.example.com".into(),
            access_token: "token".into(),
            organization: "org".into(),
            user: "user".into(),
        };

        let platform = create_platform(None, &params).unwrap();
        assert!(matches!(platform, Platform::GitLab(_)));
    }

    #[test]
    fn create_platform_github_detected() {
        let params = PlatformParams {
            base_url: "https://github.com".into(),
            access_token: "token".into(),
            organization: "org".into(),
            user: "user".into(),
        };

        let platform = create_platform(None, &params).unwrap();
        assert!(matches!(platform, Platform::GitHub(_)));
    }

    #[test]
    fn create_platform_gitea_detected() {
        let params = PlatformParams {
            base_url: "https://gitea.example.org".into(),
            access_token: "token".into(),
            organization: "org".into(),
            user: "user".into(),
        };

        let platform = create_platform(None, &params).unwrap();
        assert!(matches!(platform, Platform::Gitea(_)));
    }

    #[test]
    fn create_platform_local_detected() {
        let params = PlatformParams {
            base_url: "/tmp/repos".into(),
            access_token: "".into(),
            organization: "org".into(),
            user: "user".into(),
        };

        let platform = create_platform(None, &params).unwrap();
        assert!(matches!(platform, Platform::Local(_)));
    }

    #[test]
    fn create_platform_explicit_type_overrides_detection() {
        let params = PlatformParams {
            base_url: "https://my-server.com".into(), // Ambiguous URL
            access_token: "token".into(),
            organization: "org".into(),
            user: "user".into(),
        };

        let gitlab = create_platform(Some(PlatformType::GitLab), &params).unwrap();
        assert!(matches!(gitlab, Platform::GitLab(_)));

        let github = create_platform(Some(PlatformType::GitHub), &params).unwrap();
        assert!(matches!(github, Platform::GitHub(_)));

        let gitea = create_platform(Some(PlatformType::Gitea), &params).unwrap();
        assert!(matches!(gitea, Platform::Gitea(_)));
    }

    #[test]
    fn create_platform_unknown_url_without_explicit_type_fails() {
        let params = PlatformParams {
            base_url: "https://unknown-server.com".into(),
            access_token: "token".into(),
            organization: "org".into(),
            user: "user".into(),
        };

        let result = create_platform(None, &params);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), PlatformError::InvalidUrl(_)));
    }
}
