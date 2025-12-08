use super::common::{LogSettings, ProfileSettings};
use super::enums::{ActiveTab, Theme};
use super::normalization::Normalize;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// App-level settings stored in app.json
/// These are UI/window settings that don't belong in profiles
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct AppSettings {
    pub active_tab: ActiveTab,
    pub config_locked: bool,
    pub logging: LogSettings,
    pub options_locked: bool,
    pub sidebar_open: bool,
    pub splitter_height: u32,
    pub theme: Theme,
    pub window_height: u32,
    pub window_width: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            active_tab: ActiveTab::Lms,
            config_locked: true,
            logging: LogSettings::default(),
            options_locked: true,
            sidebar_open: true,
            splitter_height: 400,
            theme: Theme::default(),
            window_height: 0,
            window_width: 0,
        }
    }
}

/// Combined GUI settings (sent to frontend)
/// This combines app settings with the active profile's settings
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct GuiSettings {
    /// App-level settings (from app.json)
    #[serde(flatten)]
    pub app: AppSettings,

    /// Profile settings (from active profile)
    #[serde(flatten)]
    pub profile: ProfileSettings,
}

impl Default for GuiSettings {
    fn default() -> Self {
        Self {
            app: AppSettings::default(),
            profile: ProfileSettings::default(),
        }
    }
}

impl GuiSettings {
    /// Create new GUI settings with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Create GUI settings from app settings and profile settings
    pub fn from_parts(app: AppSettings, profile: ProfileSettings) -> Self {
        Self { app, profile }
    }

    /// Extract app settings
    pub fn app_settings(&self) -> &AppSettings {
        &self.app
    }

    /// Extract profile settings
    pub fn profile_settings(&self) -> &ProfileSettings {
        &self.profile
    }
}

impl Normalize for GuiSettings {
    fn normalize(&mut self) {
        self.profile.normalize();
    }
}

impl Normalize for AppSettings {
    fn normalize(&mut self) {
        // No normalization needed for app settings
    }
}

/// Result of loading settings, including any warnings about corrected issues
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, specta::Type)]
pub struct SettingsLoadResult {
    /// The loaded settings (with defaults applied for invalid/missing values)
    pub settings: GuiSettings,
    /// Warnings about issues found in the settings file
    /// (unknown fields removed, invalid values replaced with defaults)
    pub warnings: Vec<String>,
}
