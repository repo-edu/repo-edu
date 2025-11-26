use repo_manage_core::settings::SettingsManager;
use std::fs;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Generate the schema
    let schema = SettingsManager::get_schema()?;

    // Pretty-print the schema
    let schema_json = serde_json::to_string_pretty(&schema)?;

    // Write to file
    let output_path = PathBuf::from("settings-schema.json");
    fs::write(&output_path, schema_json)?;

    println!("✓ JSON Schema generated successfully!");
    println!("  Output: {}", output_path.display());
    println!();
    println!("This schema can be used for:");
    println!("  - Documentation of settings structure");
    println!("  - IDE autocomplete in settings JSON files");
    println!("  - External validation tools");
    println!("  - API documentation generation");

    Ok(())
}
