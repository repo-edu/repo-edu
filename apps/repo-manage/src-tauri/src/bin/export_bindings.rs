use std::path::PathBuf;

use repo_manage_tauri_lib as lib;

fn main() {
    // Use CARGO_MANIFEST_DIR to get the correct path relative to src-tauri
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let output_path = PathBuf::from(manifest_dir).join("../src/bindings.ts");
    lib::export_bindings(&output_path).expect("Failed to export typescript bindings");
}
