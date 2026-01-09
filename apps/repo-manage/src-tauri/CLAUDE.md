# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in this
repository.

This is the Tauri backend crate (`repo-manage-tauri`). See the root CLAUDE.md for workspace-wide
commands and architecture.

## Crate Structure

- **src/lib.rs** - App entry point, menu setup, and Tauri invoke handler
- **src/commands/** - Tauri command handlers:
  - `lms.rs` - LMS operations (verify, import students/groups)
  - `platform.rs` - Git platform operations (verify, setup, clone)
  - `settings.rs` - Settings loading/saving
  - `profiles.rs` - Profile management
  - `roster.rs` - Roster operations (save, export, student/group/assignment management)
  - `validation.rs` - Roster and connection validation
- **src/error.rs** - `AppError` type implementing `serde::Serialize` for frontend
- **src/generated/** - Auto-generated types from JSON schemas (do not edit)

Commands are thin wrappers that:

1. Deserialize frontend parameters
2. Call `repo-manage-core` operations
3. Stream progress to frontend via Tauri channels (for long-running operations)

## Adding New Commands

1. Add the command function in the appropriate `src/commands/*.rs` file
2. Register it in `tauri::generate_handler!` in `src/lib.rs`
3. Update `apps/repo-manage/schemas/commands/manifest.json`
4. Run `pnpm gen:bindings` to regenerate bindings

## Progress Events

Commands use Tauri channels to stream progress messages (see `src/commands/utils.rs`):

```rust
use tauri::ipc::Channel;

#[tauri::command]
pub async fn my_command(channel: Channel<String>) -> Result<(), AppError> {
    emit_standard_message(&channel, "Starting operation...");
    core_operation().await?;
    Ok(())
}
```

## Error Handling

Use `AppError` from `error.rs` which converts from `repo-manage-core` error types
(`ConfigError`, `PlatformError`, `LmsError`) and serializes for the frontend.

## Menu Events

Custom menu items emit events to the frontend via `window.emit()`:

- `menu-save` — Triggered by Cmd+S / File → Save
- `menu-keyboard-shortcuts` — Triggered by Help → Keyboard Shortcuts

Frontend listens with `listen("menu-save", callback)`.

## Debugging

**Empty/black window on `pnpm dev`:** Set `"visible": true` in `tauri.conf.json` window config.
This shows the window immediately, allowing you to:

- See if the frontend is loading (white background = Vite is serving)
- Right-click → Inspect to open DevTools and view console errors

The default `"visible": false` expects the frontend to call `show()` after loading, which hides
startup errors.
