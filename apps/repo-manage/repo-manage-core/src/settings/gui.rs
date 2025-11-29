use super::common::CommonSettings;
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
    pub window_width: u32,

    #[serde(default)]
    pub window_height: u32,

    #[serde(default)]
    pub window_x: i32,

    #[serde(default)]
    pub window_y: i32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Theme::default(),
            active_tab: defaults::active_tab(),
            config_locked: defaults::config_locked(),
            options_locked: defaults::options_locked(),
            window_width: 0,
            window_height: 0,
            window_x: 0,
            window_y: 0,
        }
    }
}

/// Profile settings stored in profiles/<name>.json
/// These are the form/workflow settings that differ between courses/projects
pub type ProfileSettings = CommonSettings;

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
}

impl Normalize for GuiSettings {
    fn normalize(&mut self) {
        // Normalize the profile settings (common settings)
        self.profile.normalize();
    }
}

impl Normalize for AppSettings {
    fn normalize(&mut self) {
        // No normalization needed for app settings
    }
}
