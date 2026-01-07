use super::error::{ConfigError, ConfigResult};
use std::fs;
use std::io::Write;
use std::path::Path;

/// Atomically write data to a file
///
/// This function writes to a temporary file first, then renames it to the target path.
/// This ensures that the target file is never left in a partially written state.
///
/// # Arguments
///
/// * `path` - The target file path
/// * `data` - The data to write
///
/// # Returns
///
/// * `Ok(())` if the write was successful
/// * `Err(ConfigError)` if any error occurred
pub fn atomic_write(path: &Path, data: &[u8]) -> ConfigResult<()> {
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| ConfigError::CreateDirError {
            path: parent.to_path_buf(),
            source: e,
        })?;
    }

    // Create temporary file in the same directory
    let temp_path = path.with_extension("tmp");

    // Write to temporary file
    let mut temp_file = fs::File::create(&temp_path).map_err(|e| ConfigError::WriteError {
        path: temp_path.clone(),
        source: e,
    })?;

    temp_file
        .write_all(data)
        .map_err(|e| ConfigError::WriteError {
            path: temp_path.clone(),
            source: e,
        })?;

    // Ensure data is written to disk
    temp_file.sync_all().map_err(|e| ConfigError::WriteError {
        path: temp_path.clone(),
        source: e,
    })?;

    // Close the file explicitly
    drop(temp_file);

    // Atomically rename temporary file to target file
    fs::rename(&temp_path, path).map_err(|e| ConfigError::WriteError {
        path: path.to_path_buf(),
        source: e,
    })?;

    Ok(())
}

/// Atomically write a string to a file
///
/// This is a convenience wrapper around `atomic_write` for string data.
pub fn atomic_write_string(path: &Path, data: &str) -> ConfigResult<()> {
    atomic_write(path, data.as_bytes())
}

/// Atomically write JSON to a file
///
/// This function serializes the data to JSON with pretty printing and writes it atomically.
pub fn atomic_write_json<T: serde::Serialize>(path: &Path, data: &T) -> ConfigResult<()> {
    let json = serde_json::to_string_pretty(data).map_err(|e| ConfigError::JsonParseError {
        path: path.to_path_buf(),
        source: e,
    })?;

    atomic_write_string(path, &json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_atomic_write() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        let data = b"Hello, World!";

        atomic_write(&file_path, data).unwrap();

        let contents = fs::read(&file_path).unwrap();
        assert_eq!(contents, data);
    }

    #[test]
    fn test_atomic_write_string() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        let data = "Hello, World!";

        atomic_write_string(&file_path, data).unwrap();

        let contents = fs::read_to_string(&file_path).unwrap();
        assert_eq!(contents, data);
    }

    #[test]
    fn test_atomic_write_json() {
        use serde::{Deserialize, Serialize};

        #[derive(Debug, Serialize, Deserialize, PartialEq)]
        struct TestData {
            name: String,
            value: i32,
        }

        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.json");
        let data = TestData {
            name: "test".to_string(),
            value: 42,
        };

        atomic_write_json(&file_path, &data).unwrap();

        let contents = fs::read_to_string(&file_path).unwrap();
        let loaded: TestData = serde_json::from_str(&contents).unwrap();
        assert_eq!(loaded, data);
    }

    #[test]
    fn test_atomic_write_creates_parent_dir() {
        let temp_dir = TempDir::new().unwrap();
        let nested_path = temp_dir.path().join("nested").join("dir").join("test.txt");
        let data = b"Hello, World!";

        atomic_write(&nested_path, data).unwrap();

        assert!(nested_path.exists());
        let contents = fs::read(&nested_path).unwrap();
        assert_eq!(contents, data);
    }

    #[test]
    fn test_atomic_write_overwrites_existing() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");

        // Write initial data
        atomic_write(&file_path, b"first").unwrap();
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "first");

        // Overwrite with new data
        atomic_write(&file_path, b"second").unwrap();
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "second");
    }

    #[test]
    fn test_atomic_write_no_temp_file_left() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        let temp_path = file_path.with_extension("tmp");

        atomic_write(&file_path, b"data").unwrap();

        // Verify main file exists
        assert!(file_path.exists());

        // Verify temp file doesn't exist
        assert!(!temp_path.exists());
    }
}
