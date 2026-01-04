mod csv;
mod excel;
mod normalize;

#[cfg(test)]
mod tests;

pub use csv::{parse_git_usernames_csv, parse_students_csv};
pub use excel::parse_students_excel;
pub use normalize::{
    normalize_assignment_name, normalize_email, normalize_git_username, normalize_group_name,
    normalize_header,
};

use crate::error::{PlatformError, Result};
use crate::roster::StudentDraft;
use std::path::Path;

pub fn parse_students_file(path: &Path) -> Result<Vec<StudentDraft>> {
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "csv" => {
            let file = std::fs::File::open(path)
                .map_err(|e| PlatformError::Other(format!("Failed to read file: {}", e)))?;
            parse_students_csv(file)
        }
        "xlsx" | "xls" => parse_students_excel(path),
        _ => Err(PlatformError::Other(format!(
            "Unsupported file extension: {}",
            extension
        ))),
    }
}
