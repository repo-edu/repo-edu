use repo_manage_core::GuiSettings;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let settings = GuiSettings::default();
    let json = serde_json::to_string_pretty(&settings)?;
    println!("{}", json);
    Ok(())
}
