//! Authentication configuration for LMS clients

/// Authentication credentials for LMS API access
///
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LmsAuth {
    /// Token-based authentication (Canvas, Moodle)
    ///
    /// # Example
    ///
    /// ```rust
    /// use lms_client::LmsAuth;
    ///
    /// let auth = LmsAuth::Token {
    ///     url: "https://canvas.tue.nl".to_string(),
    ///     token: "your_access_token".to_string(),
    ///     user_agent: Some("MyUniversity / admin@uni.edu".to_string()),
    /// };
    /// ```
    Token {
        /// Base URL of the LMS instance
        url: String,
        /// API access token
        token: String,
        /// Optional User-Agent header identifying the caller
        user_agent: Option<String>,
    },
}

impl LmsAuth {
    /// Get the base URL from the authentication config
    pub fn url(&self) -> &str {
        match self {
            LmsAuth::Token { url, .. } => url,
        }
    }

    /// Check if this is token-based authentication
    pub fn is_token(&self) -> bool {
        matches!(self, LmsAuth::Token { .. })
    }

    /// Get the user agent if set
    pub fn user_agent(&self) -> Option<&str> {
        match self {
            LmsAuth::Token { user_agent, .. } => user_agent.as_deref(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_auth() {
        let auth = LmsAuth::Token {
            url: "https://canvas.tue.nl".to_string(),
            token: "token123".to_string(),
            user_agent: None,
        };

        assert_eq!(auth.url(), "https://canvas.tue.nl");
        assert!(auth.is_token());
        assert!(auth.user_agent().is_none());
    }

    #[test]
    fn test_token_auth_with_user_agent() {
        let auth = LmsAuth::Token {
            url: "https://canvas.tue.nl".to_string(),
            token: "token123".to_string(),
            user_agent: Some("TestOrg / test@example.com".to_string()),
        };

        assert_eq!(auth.url(), "https://canvas.tue.nl");
        assert!(auth.is_token());
        assert_eq!(auth.user_agent(), Some("TestOrg / test@example.com"));
    }
}
