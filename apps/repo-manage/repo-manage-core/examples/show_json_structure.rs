use repo_manage_core::ProfileSettings;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let settings = ProfileSettings::default();
    let json = serde_json::to_string_pretty(&settings)?;
    println!("{}", json);
    Ok(())
}
