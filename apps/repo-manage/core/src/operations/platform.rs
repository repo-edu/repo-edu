use crate::platform::{GitHubAPI, GitLabAPI, GiteaAPI};
use crate::{GitConnection, GitServerType, GitVerifyResult};

use super::error::HandlerError;

pub async fn verify_connection(
    connection: &GitConnection,
) -> Result<GitVerifyResult, HandlerError> {
    let base_url = match connection.server_type {
        GitServerType::GitHub => connection
            .connection
            .base_url
            .clone()
            .unwrap_or_else(|| "https://github.com".to_string()),
        GitServerType::GitLab | GitServerType::Gitea => {
            connection.connection.base_url.clone().ok_or_else(|| {
                HandlerError::Validation("Git connection base URL is required".into())
            })?
        }
    };

    let username = match connection.server_type {
        GitServerType::GitHub => {
            let api = GitHubAPI::new(
                base_url.clone(),
                connection.connection.access_token.clone(),
                String::new(),
                connection.connection.user.clone(),
            )?;
            api.get_authenticated_username().await?
        }
        GitServerType::GitLab => {
            let api = GitLabAPI::new(
                base_url.clone(),
                connection.connection.access_token.clone(),
                String::new(),
                connection.connection.user.clone(),
            )?;
            api.get_authenticated_username().await?
        }
        GitServerType::Gitea => {
            let api = GiteaAPI::new(
                base_url,
                connection.connection.access_token.clone(),
                String::new(),
                connection.connection.user.clone(),
            )?;
            api.get_authenticated_username().await?
        }
    };

    Ok(GitVerifyResult {
        success: true,
        message: format!("Connected as @{}", username),
        username: Some(username),
    })
}
