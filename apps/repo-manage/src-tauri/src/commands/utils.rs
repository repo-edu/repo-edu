use crate::error::AppError;
use repo_manage_core::LmsCommonType;
use std::io::{self, Write};
use std::path::PathBuf;
use tauri::ipc::Channel;

pub const PROGRESS_PREFIX: &str = "[PROGRESS]";

#[derive(Default)]
pub struct InlineCliState {
    active: bool,
    last_len: usize,
}

impl InlineCliState {
    pub fn update(&mut self, message: &str) {
        print!("\r{}", message);
        if message.len() < self.last_len {
            let padding = " ".repeat(self.last_len - message.len());
            print!("{}", padding);
        }
        if let Err(e) = io::stdout().flush() {
            eprintln!("Failed to flush CLI progress: {}", e);
        }
        self.last_len = message.len();
        self.active = true;
    }

    pub fn finalize(&mut self) {
        if self.active {
            println!();
            self.active = false;
            self.last_len = 0;
        }
    }
}

pub fn emit_gui_message(channel: &Channel<String>, payload: String) {
    if let Err(e) = channel.send(payload) {
        eprintln!("Failed to send progress update: {}", e);
    }
}

pub fn emit_standard_message(channel: &Channel<String>, message: &str) {
    emit_gui_message(channel, message.to_string());
    println!("{}", message);
}

pub fn emit_inline_message(channel: &Channel<String>, state: &mut InlineCliState, message: &str) {
    emit_gui_message(channel, format!("{} {}", PROGRESS_PREFIX, message));
    state.update(message);
}

pub fn parse_lms_type(lms_type: &str) -> Result<LmsCommonType, AppError> {
    match lms_type {
        "Canvas" => Ok(LmsCommonType::Canvas),
        "Moodle" => Ok(LmsCommonType::Moodle),
        other => Err(AppError::new(format!(
            "Unknown LMS type: {}. Supported: Canvas, Moodle",
            other
        ))),
    }
}

pub fn lms_display_name(lms_type: &str) -> &str {
    match lms_type {
        "Canvas" => "Canvas",
        "Moodle" => "Moodle",
        _ => "LMS",
    }
}

/// Resolve and validate a directory path (existence + is_dir)
pub fn canonicalize_dir(path_str: &str) -> Result<PathBuf, AppError> {
    let path = expand_tilde(path_str);
    if !path.exists() {
        return Err(AppError::with_details(
            "Path does not exist",
            path.to_string_lossy().to_string(),
        ));
    }
    if !path.is_dir() {
        return Err(AppError::with_details(
            "Path is not a directory",
            path.to_string_lossy().to_string(),
        ));
    }
    match path.canonicalize() {
        Ok(p) => Ok(p),
        Err(e) => Err(AppError::with_details(
            "Failed to canonicalize path",
            format!("{} ({})", path.to_string_lossy(), e),
        )),
    }
}

pub fn expand_tilde(path_str: &str) -> PathBuf {
    if let Some(stripped) = path_str.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    if path_str == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }
    PathBuf::from(path_str)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn canonicalize_dir_accepts_existing_directory() {
        let dir = tempdir().unwrap();
        let path_str = dir.path().to_string_lossy().to_string();
        let result = canonicalize_dir(&path_str).unwrap();
        assert!(result.is_absolute());
        assert!(result.ends_with(dir.path().file_name().unwrap()));
    }

    #[test]
    fn canonicalize_dir_rejects_missing_directory() {
        let missing = "/this/path/should/not/exist";
        let err = canonicalize_dir(missing).unwrap_err();
        assert!(err.message.contains("does not exist"));
    }

    #[test]
    fn canonicalize_dir_rejects_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("file.txt");
        fs::write(&file_path, "hi").unwrap();
        let err = canonicalize_dir(&file_path.to_string_lossy()).unwrap_err();
        assert!(err.message.contains("not a directory"));
    }
}
