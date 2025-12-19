//! Platform verification operation

use crate::{create_platform, PlatformAPI, PlatformParams, PlatformType, ProgressEvent, Result};

/// Parameters for platform verification
#[derive(Debug, Clone)]
pub struct VerifyParams {
    pub platform_type: Option<PlatformType>,
    pub base_url: String,
    pub access_token: String,
    pub organization: String,
    pub user: String,
}

impl From<&VerifyParams> for PlatformParams {
    fn from(p: &VerifyParams) -> Self {
        PlatformParams {
            base_url: p.base_url.clone(),
            access_token: p.access_token.clone(),
            organization: p.organization.clone(),
            user: p.user.clone(),
        }
    }
}

/// Verify platform configuration and authentication
pub async fn verify_platform(
    params: &VerifyParams,
    progress: impl Fn(ProgressEvent) + Send,
) -> Result<String> {
    progress(ProgressEvent::started("Verify platform"));

    let platform = create_platform(params.platform_type, &params.into())?;

    progress(ProgressEvent::status("Verifying platform settings..."));

    platform.verify_settings().await?;

    let message = format!(
        "Configuration verified for {} on {}",
        params.organization, params.base_url
    );

    progress(ProgressEvent::completed(
        "Verify platform",
        Some(message.clone()),
    ));

    Ok(message)
}
