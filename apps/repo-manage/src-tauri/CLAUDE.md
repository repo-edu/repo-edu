# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

This is the Tauri backend crate (`repo-manage-tauri`). See the root CLAUDE.md for workspace-wide
commands and architecture.

## Crate Structure

- **src/lib.rs** - App entry point, menu setup, and tauri-specta builder
- **src/commands/** - Tauri command handlers that wrap core operations
- **src/error.rs** - Error types implementing `serde::Serialize` for frontend

Commands are thin wrappers that:

1. Deserialize frontend parameters
2. Call `repo-manage-core` operations with a progress channel
3. Stream progress events to the frontend via Tauri channels

## Adding New Commands

1. Add the command function in the appropriate `src/commands/*.rs` file
2. Register it in `create_specta_builder()` in `src/lib.rs`
3. Run `pnpm gen:bindings` to generate TypeScript types

## Progress Events

Commands use Tauri channels to stream progress:

```rust
#[tauri::command]
#[specta::specta]
pub async fn my_command(
    channel: tauri::ipc::Channel<ProgressEvent>,
) -> Result<(), CommandError> {
    let callback = |event| { let _ = channel.send(event); };
    core_operation(&callback).await?;
    Ok(())
}
```

## Error Handling

Use `CommandError` from `error.rs` which wraps `repo-manage-core::PlatformError` and serializes for
the frontend.

## Debugging

**Empty/black window on `tauri:dev`:** Set `"visible": true` in `tauri.conf.json` window config.
This shows the window immediately, allowing you to:

- See if the frontend is loading (white background = Vite is serving)
- Right-click → Inspect to open DevTools and view console errors

The default `"visible": false` expects the frontend to call `show()` after loading, which hides
startup errors.
