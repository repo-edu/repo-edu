//! Token storage and management
//!
//! This module provides secure token storage with two modes:
//! - `PlainFile`: Stores tokens in plain text files (default, for development)
//! - `Keychain`: Stores tokens in the OS keychain (secure, for production)
//!
//! ## Security Notice
//!
//! ⚠️ **WARNING**: By default, tokens are stored in plain text files for development
//! convenience. For production deployments or shared computers, use the `Keychain`
//! storage mode with the `secure-storage` feature enabled.
//!
//! ## Example
//!
//! ```rust,no_run
//! use lms_common::storage::{TokenManager, StorageMode};
//!
//! // Development mode (plain file)
//! let manager = TokenManager::new();
//! manager.save_token("canvas", "https://canvas.tue.nl", "token123").unwrap();
//!
//! // Production mode (keychain) - requires "secure-storage" feature
//! # #[cfg(feature = "secure-storage")]
//! # {
//! let manager = TokenManager::with_mode(StorageMode::Keychain);
//! manager.save_token("canvas", "https://canvas.tue.nl", "token123").unwrap();
//! # }
//! ```

use crate::error::{LmsError, LmsResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Storage mode for tokens
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum StorageMode {
    /// Store tokens in plain text files (default)
    ///
    /// Tokens are stored in `~/.config/lms-api/tokens.json` with 0600 permissions.
    /// This mode is convenient for development but not recommended for production.
    #[default]
    PlainFile,

    /// Store tokens in OS keychain (secure)
    ///
    /// Uses the system keychain:
    /// - macOS: Keychain
    /// - Windows: Credential Manager
    /// - Linux: Secret Service API
    ///
    /// Requires the `secure-storage` feature to be enabled.
    #[cfg(feature = "secure-storage")]
    Keychain,
}

/// Token storage entry
#[derive(Debug, Clone, Serialize, Deserialize)]
struct TokenEntry {
    lms_type: String,
    base_url: String,
    token: String,
}

/// Token manager for storing and retrieving LMS tokens
pub struct TokenManager {
    mode: StorageMode,
    config_dir: PathBuf,
}

impl TokenManager {
    /// Create a new token manager with default settings
    ///
    /// Uses `PlainFile` storage mode and the default config directory
    /// (`~/.config/lms-api` on Unix, `%APPDATA%\lms-api` on Windows).
    pub fn new() -> Self {
        Self::with_mode(StorageMode::default())
    }

    /// Create a token manager with a specific storage mode
    pub fn with_mode(mode: StorageMode) -> Self {
        let config_dir = Self::default_config_dir();
        Self { mode, config_dir }
    }

    /// Create a token manager with a custom config directory
    pub fn with_config_dir(config_dir: PathBuf) -> Self {
        Self {
            mode: StorageMode::default(),
            config_dir,
        }
    }

    /// Get the default config directory
    fn default_config_dir() -> PathBuf {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .expect("Could not determine home directory");

        #[cfg(target_os = "windows")]
        let config_dir = PathBuf::from(&home)
            .join("AppData")
            .join("Roaming")
            .join("lms-api");

        #[cfg(not(target_os = "windows"))]
        let config_dir = PathBuf::from(&home).join(".config").join("lms-api");

        config_dir
    }

    /// Save a token
    ///
    /// # Arguments
    ///
    /// * `lms_type` - The type of LMS (e.g., "canvas", "moodle")
    /// * `base_url` - The base URL of the LMS instance
    /// * `token` - The access token to store
    pub fn save_token(&self, lms_type: &str, base_url: &str, token: &str) -> LmsResult<()> {
        match self.mode {
            StorageMode::PlainFile => self.save_token_file(lms_type, base_url, token),
            #[cfg(feature = "secure-storage")]
            StorageMode::Keychain => self.save_token_keychain(lms_type, base_url, token),
        }
    }

    /// Load a token
    ///
    /// # Arguments
    ///
    /// * `lms_type` - The type of LMS (e.g., "canvas", "moodle")
    /// * `base_url` - The base URL of the LMS instance
    pub fn load_token(&self, lms_type: &str, base_url: &str) -> LmsResult<String> {
        match self.mode {
            StorageMode::PlainFile => self.load_token_file(lms_type, base_url),
            #[cfg(feature = "secure-storage")]
            StorageMode::Keychain => self.load_token_keychain(lms_type, base_url),
        }
    }

    /// Delete a token
    ///
    /// # Arguments
    ///
    /// * `lms_type` - The type of LMS (e.g., "canvas", "moodle")
    /// * `base_url` - The base URL of the LMS instance
    pub fn delete_token(&self, lms_type: &str, base_url: &str) -> LmsResult<()> {
        match self.mode {
            StorageMode::PlainFile => self.delete_token_file(lms_type, base_url),
            #[cfg(feature = "secure-storage")]
            StorageMode::Keychain => self.delete_token_keychain(lms_type, base_url),
        }
    }

    // PlainFile implementation
    fn tokens_file(&self) -> PathBuf {
        self.config_dir.join("tokens.json")
    }

    fn ensure_config_dir(&self) -> LmsResult<()> {
        if !self.config_dir.exists() {
            fs::create_dir_all(&self.config_dir)?;
        }
        Ok(())
    }

    fn save_token_file(&self, lms_type: &str, base_url: &str, token: &str) -> LmsResult<()> {
        self.ensure_config_dir()?;

        let tokens_file = self.tokens_file();
        let mut entries = if tokens_file.exists() {
            let content = fs::read_to_string(&tokens_file)?;
            serde_json::from_str::<Vec<TokenEntry>>(&content).unwrap_or_default()
        } else {
            Vec::new()
        };

        // Remove existing entry for this LMS type and URL
        entries.retain(|e| !(e.lms_type == lms_type && e.base_url == base_url));

        // Add new entry
        entries.push(TokenEntry {
            lms_type: lms_type.to_string(),
            base_url: base_url.to_string(),
            token: token.to_string(),
        });

        // Write to file
        let content = serde_json::to_string_pretty(&entries)?;
        fs::write(&tokens_file, content)?;

        // Set file permissions to 0600 (read/write for owner only) on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&tokens_file)?.permissions();
            perms.set_mode(0o600);
            fs::set_permissions(&tokens_file, perms)?;
        }

        Ok(())
    }

    fn load_token_file(&self, lms_type: &str, base_url: &str) -> LmsResult<String> {
        let tokens_file = self.tokens_file();
        if !tokens_file.exists() {
            return Err(LmsError::token_storage_error(
                "No tokens file found. Please save a token first.",
            ));
        }

        let content = fs::read_to_string(&tokens_file)?;
        let entries: Vec<TokenEntry> = serde_json::from_str(&content)?;

        entries
            .iter()
            .find(|e| e.lms_type == lms_type && e.base_url == base_url)
            .map(|e| e.token.clone())
            .ok_or_else(|| {
                LmsError::token_storage_error(format!(
                    "No token found for {} at {}",
                    lms_type, base_url
                ))
            })
    }

    fn delete_token_file(&self, lms_type: &str, base_url: &str) -> LmsResult<()> {
        let tokens_file = self.tokens_file();
        if !tokens_file.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&tokens_file)?;
        let mut entries: Vec<TokenEntry> = serde_json::from_str(&content)?;

        entries.retain(|e| !(e.lms_type == lms_type && e.base_url == base_url));

        let content = serde_json::to_string_pretty(&entries)?;
        fs::write(&tokens_file, content)?;

        Ok(())
    }

    // Keychain implementation
    #[cfg(feature = "secure-storage")]
    fn keychain_service_name(&self, lms_type: &str, base_url: &str) -> String {
        format!("lms-api.{}.{}", lms_type, base_url)
    }

    #[cfg(feature = "secure-storage")]
    fn save_token_keychain(&self, lms_type: &str, base_url: &str, token: &str) -> LmsResult<()> {
        use keyring::Entry;

        let service = self.keychain_service_name(lms_type, base_url);
        let username = whoami::username();

        let entry = Entry::new(&service, &username)
            .map_err(|e| LmsError::token_storage_error(format!("Keychain error: {}", e)))?;

        entry
            .set_password(token)
            .map_err(|e| LmsError::token_storage_error(format!("Failed to save token: {}", e)))?;

        Ok(())
    }

    #[cfg(feature = "secure-storage")]
    fn load_token_keychain(&self, lms_type: &str, base_url: &str) -> LmsResult<String> {
        use keyring::Entry;

        let service = self.keychain_service_name(lms_type, base_url);
        let username = whoami::username();

        let entry = Entry::new(&service, &username)
            .map_err(|e| LmsError::token_storage_error(format!("Keychain error: {}", e)))?;

        entry
            .get_password()
            .map_err(|e| LmsError::token_storage_error(format!("Failed to load token: {}", e)))
    }

    #[cfg(feature = "secure-storage")]
    fn delete_token_keychain(&self, lms_type: &str, base_url: &str) -> LmsResult<()> {
        use keyring::Entry;

        let service = self.keychain_service_name(lms_type, base_url);
        let username = whoami::username();

        let entry = Entry::new(&service, &username)
            .map_err(|e| LmsError::token_storage_error(format!("Keychain error: {}", e)))?;

        entry
            .delete_password()
            .map_err(|e| LmsError::token_storage_error(format!("Failed to delete token: {}", e)))?;

        Ok(())
    }
}

impl Default for TokenManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Generate a .gitignore entry for token files
pub fn generate_gitignore_entry() -> &'static str {
    "# LMS API tokens\ntokens.json\n.config/lms-api/tokens.json\n"
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_config_dir() -> PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let id = COUNTER.fetch_add(1, Ordering::SeqCst);
        env::temp_dir().join(format!("lms-api-test-{}-{}", whoami::username(), id))
    }

    #[test]
    fn test_plain_file_storage() {
        let config_dir = temp_config_dir();
        let _ = fs::remove_dir_all(&config_dir); // Clean up from previous tests

        let manager = TokenManager {
            mode: StorageMode::PlainFile,
            config_dir: config_dir.clone(),
        };

        // Save token
        manager
            .save_token("canvas", "https://canvas.test.edu", "test_token_123")
            .unwrap();

        // Load token
        let token = manager
            .load_token("canvas", "https://canvas.test.edu")
            .unwrap();
        assert_eq!(token, "test_token_123");

        // Delete token
        manager
            .delete_token("canvas", "https://canvas.test.edu")
            .unwrap();

        // Verify deletion
        let result = manager.load_token("canvas", "https://canvas.test.edu");
        assert!(result.is_err());

        // Clean up
        let _ = fs::remove_dir_all(&config_dir);
    }

    #[test]
    fn test_multiple_tokens() {
        let config_dir = temp_config_dir();
        let _ = fs::remove_dir_all(&config_dir);

        let manager = TokenManager {
            mode: StorageMode::PlainFile,
            config_dir: config_dir.clone(),
        };

        // Save multiple tokens
        manager
            .save_token("canvas", "https://canvas1.edu", "token1")
            .unwrap();
        manager
            .save_token("canvas", "https://canvas2.edu", "token2")
            .unwrap();
        manager
            .save_token("moodle", "https://moodle.edu", "token3")
            .unwrap();

        // Load each token
        assert_eq!(
            manager.load_token("canvas", "https://canvas1.edu").unwrap(),
            "token1"
        );
        assert_eq!(
            manager.load_token("canvas", "https://canvas2.edu").unwrap(),
            "token2"
        );
        assert_eq!(
            manager.load_token("moodle", "https://moodle.edu").unwrap(),
            "token3"
        );

        // Clean up
        let _ = fs::remove_dir_all(&config_dir);
    }
}
