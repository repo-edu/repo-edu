//! Helper utilities for token generation and management

use crate::error::LmsResult;
use serde::{Deserialize, Serialize};

/// Supported LMS types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LmsType {
    /// Canvas LMS
    Canvas,
    /// Moodle LMS
    Moodle,
}

/// Result of LMS type auto-detection
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LmsDetection {
    /// High confidence detection
    Detected(LmsType),
    /// Medium confidence detection (might need user confirmation)
    Probable(LmsType),
    /// Could not detect LMS type
    Unknown,
}

/// Confidence level of LMS detection
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Confidence {
    /// High confidence - clear indicators in URL
    High,
    /// Medium confidence - some indicators but not certain
    Medium,
    /// Manual selection by user
    Manual,
}

/// Complete token generation information
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokenInfo {
    /// The detected or specified LMS type
    pub lms_type: LmsType,
    /// Human-readable LMS name
    pub lms_name: &'static str,
    /// URL for token generation page
    pub token_url: String,
    /// Instructions for generating a token
    pub instructions: &'static str,
    /// Confidence level of detection
    pub detection_confidence: Confidence,
}

impl LmsType {
    /// Get the LMS type as a string
    pub fn as_str(&self) -> &'static str {
        match self {
            LmsType::Canvas => "canvas",
            LmsType::Moodle => "moodle",
        }
    }

    /// Get human-readable name
    pub fn name(&self) -> &'static str {
        match self {
            LmsType::Canvas => "Canvas",
            LmsType::Moodle => "Moodle",
        }
    }
}

/// Get the URL for token generation for a specific LMS
///
/// # Arguments
///
/// * `base_url` - The base URL of the LMS instance (e.g., `https://canvas.tue.nl`)
/// * `lms_type` - The type of LMS
///
/// # Example
///
/// ```rust
/// use lms_common::helpers::{get_token_generation_url, LmsType};
///
/// let url = get_token_generation_url("https://canvas.tue.nl", LmsType::Canvas);
/// assert_eq!(url, "https://canvas.tue.nl/profile/settings");
/// ```
pub fn get_token_generation_url(base_url: &str, lms_type: LmsType) -> String {
    let base_url = base_url.trim_end_matches('/');

    match lms_type {
        LmsType::Canvas => format!("{}/profile/settings", base_url),
        LmsType::Moodle => format!("{}/user/security.php", base_url),
    }
}

/// Auto-detect LMS type from URL patterns
///
/// Uses pattern matching on the URL to determine the LMS type.
///
/// # Arguments
///
/// * `url` - The institution's LMS URL (e.g., `https://canvas.tue.nl` or `canvas.tue.nl`)
///
/// # Returns
///
/// * `LmsDetection::Detected(LmsType)` - High confidence detection
/// * `LmsDetection::Probable(LmsType)` - Medium confidence (user confirmation recommended)
/// * `LmsDetection::Unknown` - Could not detect, manual selection required
///
/// # Example
///
/// ```rust
/// use lms_common::helpers::{detect_lms_type, LmsDetection, LmsType};
///
/// match detect_lms_type("https://canvas.tue.nl") {
///     LmsDetection::Detected(lms_type) => println!("Detected {:?}", lms_type),
///     LmsDetection::Probable(lms_type) => println!("Probably {:?}", lms_type),
///     LmsDetection::Unknown => println!("Unknown LMS"),
/// }
/// ```
pub fn detect_lms_type(url: &str) -> LmsDetection {
    // Normalize URL: remove protocol and trailing slashes
    let normalized = url
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/');

    // Convert to lowercase for case-insensitive matching
    let lower = normalized.to_lowercase();

    // High confidence patterns - domain or subdomain matches

    // Canvas detection
    if lower.contains("canvas.") || lower.starts_with("canvas") {
        return LmsDetection::Detected(LmsType::Canvas);
    }
    if lower.ends_with(".instructure.com") || lower.contains(".instructure.com/") {
        return LmsDetection::Detected(LmsType::Canvas);
    }

    // Moodle detection
    if lower.contains("moodle.") || lower.starts_with("moodle") {
        return LmsDetection::Detected(LmsType::Moodle);
    }

    // Medium confidence patterns - check for keywords in path or subdomain

    // Check for "canvas" anywhere in URL
    if lower.contains("canvas") {
        return LmsDetection::Probable(LmsType::Canvas);
    }

    // Check for "moodle" anywhere in URL
    if lower.contains("moodle") {
        return LmsDetection::Probable(LmsType::Moodle);
    }

    // Could not detect
    LmsDetection::Unknown
}

/// Get complete token generation information with auto-detection
///
/// This function auto-detects the LMS type and returns all information needed
/// to help users generate an access token.
///
/// # Arguments
///
/// * `url` - The institution's LMS URL
///
/// # Returns
///
/// * `Ok(TokenInfo)` - Successfully detected and generated token info
/// * `Err(String)` - Could not detect LMS type (manual selection required)
///
/// # Example
///
/// ```rust
/// use lms_common::helpers::get_token_info;
///
/// match get_token_info("https://canvas.tue.nl") {
///     Ok(info) => {
///         println!("Detected: {}", info.lms_name);
///         println!("Token URL: {}", info.token_url);
///     }
///     Err(msg) => println!("Error: {}", msg),
/// }
/// ```
pub fn get_token_info(url: &str) -> Result<TokenInfo, String> {
    match detect_lms_type(url) {
        LmsDetection::Detected(lms_type) => Ok(build_token_info(url, lms_type, Confidence::High)),
        LmsDetection::Probable(lms_type) => Ok(build_token_info(url, lms_type, Confidence::Medium)),
        LmsDetection::Unknown => Err(
            "Could not detect LMS type from URL. Please specify the LMS type manually.".to_string(),
        ),
    }
}

/// Get token generation information with manual LMS type specification
///
/// Use this when auto-detection fails or when the user wants to override
/// the detected LMS type.
///
/// # Arguments
///
/// * `url` - The institution's LMS URL
/// * `lms_type` - The LMS type to use
///
/// # Example
///
/// ```rust
/// use lms_common::helpers::{get_token_info_with_type, LmsType};
///
/// let info = get_token_info_with_type("https://lms.university.edu", LmsType::Canvas);
/// println!("Token URL: {}", info.token_url);
/// ```
pub fn get_token_info_with_type(url: &str, lms_type: LmsType) -> TokenInfo {
    build_token_info(url, lms_type, Confidence::Manual)
}

/// Helper function to build TokenInfo
fn build_token_info(url: &str, lms_type: LmsType, confidence: Confidence) -> TokenInfo {
    // Ensure URL has protocol
    let base_url = if url.starts_with("http://") || url.starts_with("https://") {
        url.to_string()
    } else {
        format!("https://{}", url)
    };

    let base_url = base_url.trim_end_matches('/');

    TokenInfo {
        lms_type,
        lms_name: lms_type.name(),
        token_url: get_token_generation_url(base_url, lms_type),
        instructions: get_token_generation_instructions(lms_type),
        detection_confidence: confidence,
    }
}

/// Open the token generation URL in the system browser
///
/// # Arguments
///
/// * `base_url` - The base URL of the LMS instance
/// * `lms_type` - The type of LMS
///
/// # Example
///
/// ```rust,no_run
/// use lms_common::helpers::{open_token_generation_url, LmsType};
///
/// open_token_generation_url("https://canvas.tue.nl", LmsType::Canvas).unwrap();
/// ```
pub fn open_token_generation_url(base_url: &str, lms_type: LmsType) -> LmsResult<()> {
    let url = get_token_generation_url(base_url, lms_type);

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| crate::error::LmsError::Other(format!("Failed to open browser: {}", e)))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/C", "start", &url])
            .spawn()
            .map_err(|e| crate::error::LmsError::Other(format!("Failed to open browser: {}", e)))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| crate::error::LmsError::Other(format!("Failed to open browser: {}", e)))?;
    }

    Ok(())
}

/// Instructions for generating a token for a specific LMS
pub fn get_token_generation_instructions(lms_type: LmsType) -> &'static str {
    match lms_type {
        LmsType::Canvas => {
            r#"To generate a Canvas API token:

1. Navigate to your Canvas profile settings (Account > Settings)
2. Scroll down to "Approved Integrations"
3. Click "+ New Access Token"
4. Enter a purpose (e.g., "LMS API Access")
5. Set an expiration date (optional, recommended for security)
6. Click "Generate Token"
7. Copy the token immediately (it won't be shown again)
"#
        }
        LmsType::Moodle => {
            r#"To generate a Moodle API token:

1. Navigate to your Moodle profile (User menu > Preferences)
2. Click on "Security keys" in the User account section
3. Scroll to "User private access tokens"
4. Enter a token name and click "Create token"
5. Copy the generated token immediately

Note: Your Moodle administrator must enable web services for this to work."#
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_token_generation_url() {
        assert_eq!(
            get_token_generation_url("https://canvas.tue.nl", LmsType::Canvas),
            "https://canvas.tue.nl/profile/settings"
        );

        assert_eq!(
            get_token_generation_url("https://moodle.edu", LmsType::Moodle),
            "https://moodle.edu/user/security.php"
        );

        // Test with trailing slash
        assert_eq!(
            get_token_generation_url("https://canvas.tue.nl/", LmsType::Canvas),
            "https://canvas.tue.nl/profile/settings"
        );
    }

    #[test]
    fn test_lms_type_as_str() {
        assert_eq!(LmsType::Canvas.as_str(), "canvas");
        assert_eq!(LmsType::Moodle.as_str(), "moodle");
    }

    #[test]
    fn test_lms_type_name() {
        assert_eq!(LmsType::Canvas.name(), "Canvas");
        assert_eq!(LmsType::Moodle.name(), "Moodle");
    }

    // Auto-detection tests

    #[test]
    fn test_detect_canvas_high_confidence() {
        // Subdomain patterns
        assert_eq!(
            detect_lms_type("https://canvas.tue.nl"),
            LmsDetection::Detected(LmsType::Canvas)
        );
        assert_eq!(
            detect_lms_type("canvas.university.edu"),
            LmsDetection::Detected(LmsType::Canvas)
        );
        assert_eq!(
            detect_lms_type("https://canvas-test.edu"),
            LmsDetection::Detected(LmsType::Canvas)
        );

        // Instructure domain
        assert_eq!(
            detect_lms_type("https://university.instructure.com"),
            LmsDetection::Detected(LmsType::Canvas)
        );
        assert_eq!(
            detect_lms_type("myschool.instructure.com"),
            LmsDetection::Detected(LmsType::Canvas)
        );

        // Case insensitive
        assert_eq!(
            detect_lms_type("https://CANVAS.TUE.NL"),
            LmsDetection::Detected(LmsType::Canvas)
        );
    }

    #[test]
    fn test_detect_moodle_high_confidence() {
        assert_eq!(
            detect_lms_type("https://moodle.university.edu"),
            LmsDetection::Detected(LmsType::Moodle)
        );
        assert_eq!(
            detect_lms_type("moodle.school.org"),
            LmsDetection::Detected(LmsType::Moodle)
        );
        assert_eq!(
            detect_lms_type("https://moodle-prod.edu"),
            LmsDetection::Detected(LmsType::Moodle)
        );

        // Case insensitive
        assert_eq!(
            detect_lms_type("MOODLE.university.edu"),
            LmsDetection::Detected(LmsType::Moodle)
        );
    }

    #[test]
    fn test_detect_probable_patterns() {
        // Canvas in path or elsewhere
        assert_eq!(
            detect_lms_type("https://lms.edu/canvas"),
            LmsDetection::Probable(LmsType::Canvas)
        );

        // Moodle in path
        assert_eq!(
            detect_lms_type("https://lms.edu/moodle"),
            LmsDetection::Probable(LmsType::Moodle)
        );
    }

    #[test]
    fn test_detect_unknown() {
        assert_eq!(
            detect_lms_type("https://lms.university.edu"),
            LmsDetection::Unknown
        );
        assert_eq!(
            detect_lms_type("https://elearning.school.org"),
            LmsDetection::Unknown
        );
        assert_eq!(
            detect_lms_type("https://courses.edu"),
            LmsDetection::Unknown
        );
    }

    #[test]
    fn test_get_token_info_canvas() {
        let info = get_token_info("https://canvas.tue.nl").unwrap();
        assert_eq!(info.lms_type, LmsType::Canvas);
        assert_eq!(info.lms_name, "Canvas");
        assert_eq!(info.token_url, "https://canvas.tue.nl/profile/settings");
        assert_eq!(info.detection_confidence, Confidence::High);
        assert!(info.instructions.contains("Canvas"));
    }

    #[test]
    fn test_get_token_info_moodle() {
        let info = get_token_info("https://moodle.university.edu").unwrap();
        assert_eq!(info.lms_type, LmsType::Moodle);
        assert_eq!(info.lms_name, "Moodle");
        assert_eq!(
            info.token_url,
            "https://moodle.university.edu/user/security.php"
        );
        assert_eq!(info.detection_confidence, Confidence::High);
        assert!(info.instructions.contains("Moodle"));
    }

    #[test]
    fn test_get_token_info_probable() {
        let info = get_token_info("https://lms.edu/canvas").unwrap();
        assert_eq!(info.lms_type, LmsType::Canvas);
        assert_eq!(info.detection_confidence, Confidence::Medium);
    }

    #[test]
    fn test_get_token_info_unknown() {
        let result = get_token_info("https://lms.university.edu");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Could not detect"));
    }

    #[test]
    fn test_get_token_info_with_type() {
        let info = get_token_info_with_type("https://lms.university.edu", LmsType::Canvas);
        assert_eq!(info.lms_type, LmsType::Canvas);
        assert_eq!(info.lms_name, "Canvas");
        assert_eq!(
            info.token_url,
            "https://lms.university.edu/profile/settings"
        );
        assert_eq!(info.detection_confidence, Confidence::Manual);
    }

    #[test]
    fn test_get_token_info_url_normalization() {
        // Without protocol
        let info1 = get_token_info("canvas.tue.nl").unwrap();
        assert_eq!(info1.token_url, "https://canvas.tue.nl/profile/settings");

        // With protocol
        let info2 = get_token_info("https://canvas.tue.nl").unwrap();
        assert_eq!(info2.token_url, "https://canvas.tue.nl/profile/settings");

        // With trailing slash
        let info3 = get_token_info("https://canvas.tue.nl/").unwrap();
        assert_eq!(info3.token_url, "https://canvas.tue.nl/profile/settings");
    }
}
