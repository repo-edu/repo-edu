mod commands;
mod error;

use std::fs;

/// Export TypeScript bindings for the Tauri commands.
pub fn export_bindings(
    output_path: impl AsRef<std::path::Path>,
) -> Result<(), Box<dyn std::error::Error>> {
    let builder = create_specta_builder();
    builder.export(
        specta_typescript::Typescript::default(),
        output_path.as_ref(),
    )?;

    // Post-process the generated TypeScript
    let content = fs::read_to_string(output_path.as_ref())?;

    // Remove @ts-nocheck comments
    let content = content
        .lines()
        .filter(|line| !line.trim_start().starts_with("// @ts-nocheck"))
        .collect::<Vec<_>>()
        .join("\n");

    // Fix TypeScript errors in generated code:
    // 1. Remove conflicting TAURI_CHANNEL type definition (conflicts with import)
    // 2. Mark unused __makeEvents__ function with @ts-expect-error
    let content = content
        .lines()
        .filter(|line| !line.starts_with("export type TAURI_CHANNEL<TSend>"))
        .collect::<Vec<_>>()
        .join("\n");

    let content = content.replace(
        "function __makeEvents__",
        "// @ts-expect-error Generated but unused when no events defined\nfunction __makeEvents__",
    );

    fs::write(output_path.as_ref(), content)?;
    Ok(())
}

/// Creates a tauri-specta builder with all commands registered.
/// Single source of truth for command registration.
fn create_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
        // Settings commands
        commands::settings::load_settings,
        commands::settings::save_settings,
        commands::settings::load_app_settings,
        commands::settings::save_app_settings,
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
        commands::profiles::load_profile,
        commands::profiles::save_profile,
        commands::profiles::delete_profile,
        commands::profiles::rename_profile,
        // LMS commands
        commands::lms::get_token_instructions,
        commands::lms::open_token_url,
        commands::lms::verify_lms_course,
        commands::lms::generate_lms_files,
        // Platform commands
        commands::platform::verify_config,
        commands::platform::setup_repos,
        commands::platform::clone_repos
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = create_specta_builder();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            // Theme is now controlled by the frontend via useTheme hook
            // based on saved settings and system preference
            Ok(())
        })
        .invoke_handler(builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
