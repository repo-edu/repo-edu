use std::path::PathBuf;

use repo_manage_tauri_lib as lib;

fn main() {
    let output_path = PathBuf::from("../src/bindings.ts");
    lib::export_bindings(&output_path).expect("Failed to export typescript bindings");
}
