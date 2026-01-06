mod commands;
mod error;
mod generated;
#[cfg(test)]
mod tests;

use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};

/// Disable macOS automatic Edit menu items (Dictation, Emoji & Symbols)
#[cfg(target_os = "macos")]
fn disable_macos_edit_menu_extras() {
    use objc2_foundation::{ns_string, NSUserDefaults};

    let defaults = NSUserDefaults::standardUserDefaults();
    defaults.setBool_forKey(true, ns_string!("NSDisabledDictationMenuItem"));
    defaults.setBool_forKey(true, ns_string!("NSDisabledCharacterPaletteMenuItem"));
}

#[cfg(not(target_os = "macos"))]
fn disable_macos_edit_menu_extras() {
    // No-op on non-macOS platforms
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Disable macOS automatic Edit menu extras before app starts
    disable_macos_edit_menu_extras();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            // Build custom menu
            let save_item = MenuItemBuilder::with_id("save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;

            let shortcuts_item =
                MenuItemBuilder::with_id("keyboard-shortcuts", "Keyboard Shortcuts").build(app)?;

            // App submenu (macOS only shows app name)
            let app_submenu = SubmenuBuilder::new(app, "RepoManage")
                .item(&PredefinedMenuItem::about(
                    app,
                    Some("About RepoManage"),
                    None,
                )?)
                .separator()
                .item(&PredefinedMenuItem::services(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(app, Some("Hide RepoManage"))?)
                .item(&PredefinedMenuItem::hide_others(app, Some("Hide Others"))?)
                .item(&PredefinedMenuItem::show_all(app, Some("Show All"))?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, Some("Quit RepoManage"))?)
                .build()?;

            // File submenu with Save
            let file_submenu = SubmenuBuilder::new(app, "File")
                .item(&save_item)
                .separator()
                .item(&PredefinedMenuItem::close_window(
                    app,
                    Some("Close Window"),
                )?)
                .build()?;

            // Edit submenu - only standard text editing
            let edit_submenu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;

            // Window submenu
            let window_submenu = SubmenuBuilder::new(app, "Window")
                .item(&PredefinedMenuItem::minimize(app, None)?)
                .item(&PredefinedMenuItem::maximize(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::fullscreen(
                    app,
                    Some("Enter Full Screen"),
                )?)
                .build()?;

            // Help submenu
            let help_submenu = SubmenuBuilder::new(app, "Help")
                .item(&shortcuts_item)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_submenu)
                .item(&file_submenu)
                .item(&edit_submenu)
                .item(&window_submenu)
                .item(&help_submenu)
                .build()?;

            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(move |app, event| {
                if let Some(window) = app.get_webview_window("main") {
                    match event.id().as_ref() {
                        "save" => {
                            let _ = window.emit("menu-save", ());
                        }
                        "keyboard-shortcuts" => {
                            let _ = window.emit("menu-keyboard-shortcuts", ());
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Settings commands
            commands::settings::load_settings,
            commands::settings::load_app_settings,
            commands::settings::save_app_settings,
            commands::settings::list_git_connections,
            commands::settings::get_git_connection,
            commands::settings::save_git_connection,
            commands::settings::delete_git_connection,
            commands::settings::get_identity_mode,
            commands::settings::load_profile,
            commands::settings::save_profile,
            commands::settings::save_profile_and_roster,
            commands::settings::reset_settings,
            commands::settings::get_default_settings,
            commands::settings::get_settings_path,
            commands::settings::settings_exist,
            commands::settings::import_settings,
            commands::settings::export_settings,
            commands::settings::get_settings_schema,
            commands::settings::load_settings_or_default,
            // Profile commands
            commands::profiles::list_profiles,
            commands::profiles::get_active_profile,
            commands::profiles::set_active_profile,
            commands::profiles::delete_profile,
            commands::profiles::rename_profile,
            commands::profiles::create_profile,
            commands::profiles::reveal_profiles_directory,
            // Roster commands
            commands::roster::get_roster,
            commands::roster::clear_roster,
            commands::roster::check_student_removal,
            commands::roster::import_git_usernames,
            commands::roster::verify_git_usernames,
            commands::roster::export_teams,
            commands::roster::export_students,
            commands::roster::export_assignment_students,
            commands::roster::get_roster_coverage,
            commands::roster::export_roster_coverage,
            // Validation commands
            commands::validation::validate_roster,
            commands::validation::validate_assignment,
            // LMS commands
            commands::lms::get_token_instructions,
            commands::lms::open_token_url,
            commands::lms::verify_lms_course,
            commands::lms::generate_lms_files,
            commands::lms::get_group_categories,
            commands::lms::verify_lms_connection,
            commands::lms::verify_lms_connection_draft,
            commands::lms::fetch_lms_courses,
            commands::lms::fetch_lms_courses_draft,
            commands::lms::import_students_from_lms,
            commands::lms::import_students_from_file,
            commands::lms::fetch_lms_group_sets,
            commands::lms::fetch_lms_group_set_list,
            commands::lms::fetch_lms_groups_for_set,
            commands::lms::import_groups_from_lms,
            commands::lms::assignment_has_groups,
            commands::lms::verify_profile_course,
            // Platform commands
            commands::platform::verify_config,
            commands::platform::setup_repos,
            commands::platform::clone_repos,
            commands::platform::verify_git_connection,
            commands::platform::verify_git_connection_draft,
            // Roster-based git operations
            commands::platform::preflight_create_repos,
            commands::platform::preflight_clone_repos,
            commands::platform::preflight_delete_repos,
            commands::platform::create_repos,
            commands::platform::clone_repos_from_roster,
            commands::platform::delete_repos,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
