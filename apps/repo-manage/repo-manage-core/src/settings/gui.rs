use super::common::{LogSettings, ProfileSettings};
use super::enums::{ActiveTab, Theme};
use super::normalization::Normalize;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// App-level settings stored in app.json
/// These are UI/window settings that don't belong in profiles
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AppSettings {
    #[serde(default)]
    pub theme: Theme,

    #[serde(default = "defaults::active_tab")]
    pub active_tab: ActiveTab,

    #[serde(default = "defaults::config_locked")]
    pub config_locked: bool,

    #[serde(default = "defaults::options_locked")]
    pub options_locked: bool,

    #[serde(default)]
    pub sidebar_open: bool,

    #[serde(default = "defaults::splitter_height")]
    pub splitter_height: u32,

    #[serde(default)]
    pub window_width: u32,

    #[serde(default)]
    pub window_height: u32,

    #[serde(default)]
    pub logging: LogSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Theme::default(),
            active_tab: defaults::active_tab(),
            config_locked: defaults::config_locked(),
            options_locked: defaults::options_locked(),
            sidebar_open: false,
            splitter_height: defaults::splitter_height(),
            window_width: 0,
            window_height: 0,
            logging: LogSettings::default(),
        }
    }
}

/// Combined GUI settings (sent to frontend)
/// This combines app settings with the active profile's settings
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
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

mod defaults {
    use super::ActiveTab;

    pub fn active_tab() -> ActiveTab {
        ActiveTab::Lms
    }

    pub fn config_locked() -> bool {
        true
    }

    pub fn options_locked() -> bool {
        true
    }

    pub fn splitter_height() -> u32 {
        400
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
