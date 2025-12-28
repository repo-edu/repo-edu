use super::normalization::Normalize;
use crate::generated::types::{
    ActiveTab, AppSettings, GuiSettings, LogSettings, ProfileSettings, Theme,
};

/// App-level settings stored in app.json
/// These are UI/window settings that don't belong in profiles
impl Default for AppSettings {
    fn default() -> Self {
        Self {
            active_tab: ActiveTab::Lms,
            collapsed_sections: Vec::new(),
            logging: LogSettings::default(),
            sidebar_open: true,
            theme: Theme::default(),
            window_height: 0,
            window_width: 0,
        }
    }
}

/// Combined GUI settings (sent to frontend)
/// This combines app settings with the active profile's settings
impl Default for GuiSettings {
    fn default() -> Self {
        Self::from_parts(AppSettings::default(), ProfileSettings::default())
    }
}

impl GuiSettings {
    /// Create new GUI settings with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Create GUI settings from app settings and profile settings
    pub fn from_parts(app: AppSettings, profile: ProfileSettings) -> Self {
        Self {
            active_tab: app.active_tab,
            collapsed_sections: app.collapsed_sections,
            logging: app.logging,
            sidebar_open: app.sidebar_open,
            theme: app.theme,
            window_height: app.window_height,
            window_width: app.window_width,
            git: profile.git,
            lms: profile.lms,
            repo: profile.repo,
        }
    }

    /// Extract app settings (returns a copy)
    pub fn app_settings(&self) -> AppSettings {
        AppSettings {
            active_tab: self.active_tab,
            collapsed_sections: self.collapsed_sections.clone(),
            logging: self.logging.clone(),
            sidebar_open: self.sidebar_open,
            theme: self.theme,
            window_height: self.window_height,
            window_width: self.window_width,
        }
    }

    /// Extract profile settings (returns a copy)
    pub fn profile_settings(&self) -> ProfileSettings {
        ProfileSettings {
            git: self.git.clone(),
            lms: self.lms.clone(),
            repo: self.repo.clone(),
        }
    }
}

impl Normalize for GuiSettings {
    fn normalize(&mut self) {
        self.git.normalize();
        self.lms.normalize();
        self.repo.normalize();
    }
}

impl Normalize for AppSettings {
    fn normalize(&mut self) {
        // No normalization needed for app settings
    }
}
