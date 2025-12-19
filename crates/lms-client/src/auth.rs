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
    /// };
    /// ```
    Token {
        /// Base URL of the LMS instance
        url: String,
        /// API access token
        token: String,
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_auth() {
        let auth = LmsAuth::Token {
            url: "https://canvas.tue.nl".to_string(),
            token: "token123".to_string(),
        };

        assert_eq!(auth.url(), "https://canvas.tue.nl");
        assert!(auth.is_token());
    }
}
