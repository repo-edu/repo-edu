use crate::error::{PlatformError, Result};
use crate::generated::types::GitUsernameEntry;
use crate::import::normalize::{normalize_email, normalize_git_username, normalize_header};
use crate::roster::StudentDraft;
use std::collections::HashMap;
use std::io::Read;

#[derive(Debug, Clone)]
pub(crate) struct HeaderInfo {
    pub(crate) original: String,
    pub(crate) normalized: String,
}

pub fn parse_students_csv<R: Read>(reader: R) -> Result<Vec<StudentDraft>> {
    let mut csv_reader = csv::ReaderBuilder::new()
        .flexible(true)
        .has_headers(true)
        .from_reader(reader);

    let headers = csv_reader
        .headers()
        .map_err(|e| PlatformError::Other(format!("Failed to read CSV headers: {}", e)))?
        .iter()
        .map(|h| HeaderInfo {
            original: h.trim().to_string(),
            normalized: normalize_header(h),
        })
        .collect::<Vec<_>>();

    parse_student_rows(&headers, csv_reader.records())
}

pub fn parse_git_usernames_csv<R: Read>(reader: R) -> Result<Vec<GitUsernameEntry>> {
    let mut csv_reader = csv::ReaderBuilder::new()
        .flexible(true)
        .has_headers(true)
        .from_reader(reader);

    let headers = csv_reader
        .headers()
        .map_err(|e| PlatformError::Other(format!("Failed to read CSV headers: {}", e)))?
        .iter()
        .map(|h| HeaderInfo {
            original: h.trim().to_string(),
            normalized: normalize_header(h),
        })
        .collect::<Vec<_>>();

    parse_git_username_rows(&headers, csv_reader.records())
}

pub(crate) fn parse_student_rows<I>(headers: &[HeaderInfo], records: I) -> Result<Vec<StudentDraft>>
where
    I: Iterator<Item = std::result::Result<csv::StringRecord, csv::Error>>,
{
    let mut missing_headers = Vec::new();
    if !headers.iter().any(|h| h.normalized == "name") {
        missing_headers.push("name");
    }
    if !headers.iter().any(|h| h.normalized == "email") {
        missing_headers.push("email");
    }
    if !missing_headers.is_empty() {
        return Err(PlatformError::Other(format!(
            "Missing required headers: {}",
            missing_headers.join(", ")
        )));
    }

    let mut email_to_index: HashMap<String, usize> = HashMap::new();
    let mut drafts: Vec<StudentDraft> = Vec::new();
    let mut missing_rows: Vec<usize> = Vec::new();

    for (row_index, record) in records.enumerate() {
        let record =
            record.map_err(|e| PlatformError::Other(format!("Failed to read CSV row: {}", e)))?;

        if record.iter().all(|cell| cell.trim().is_empty()) {
            continue;
        }

        let mut name = String::new();
        let mut email = String::new();
        let mut student_number: Option<String> = None;
        let mut git_username: Option<String> = None;
        let mut custom_fields: HashMap<String, String> = HashMap::new();

        for (idx, header) in headers.iter().enumerate() {
            let value = record.get(idx).unwrap_or("").trim();
            if value.is_empty() {
                continue;
            }

            match header.normalized.as_str() {
                "name" => name = value.to_string(),
                "email" => email = value.to_string(),
                "student_number" => student_number = Some(value.to_string()),
                "git_username" => git_username = Some(normalize_git_username(value)),
                _ => {
                    custom_fields.insert(header.original.clone(), value.to_string());
                }
            }
        }

        let row_number = row_index + 2;
        if name.trim().is_empty() || email.trim().is_empty() {
            missing_rows.push(row_number);
            continue;
        }

        let normalized_email = normalize_email(&email);
        let draft = StudentDraft {
            name: name.trim().to_string(),
            email: normalized_email.clone(),
            student_number: student_number.filter(|v| !v.trim().is_empty()),
            git_username: git_username.filter(|v| !v.trim().is_empty()),
            lms_user_id: None,
            custom_fields,
        };

        if let Some(existing) = email_to_index.get(&normalized_email).copied() {
            drafts[existing] = draft;
        } else {
            email_to_index.insert(normalized_email, drafts.len());
            drafts.push(draft);
        }
    }

    if !missing_rows.is_empty() {
        return Err(PlatformError::Other(format!(
            "Missing required fields in rows: {}",
            missing_rows
                .iter()
                .map(|row| row.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        )));
    }

    Ok(drafts)
}

pub(crate) fn parse_git_username_rows<I>(
    headers: &[HeaderInfo],
    records: I,
) -> Result<Vec<GitUsernameEntry>>
where
    I: Iterator<Item = std::result::Result<csv::StringRecord, csv::Error>>,
{
    let mut missing_headers = Vec::new();
    if !headers.iter().any(|h| h.normalized == "email") {
        missing_headers.push("email");
    }
    if !headers.iter().any(|h| h.normalized == "git_username") {
        missing_headers.push("git_username");
    }
    if !missing_headers.is_empty() {
        return Err(PlatformError::Other(format!(
            "Missing required headers: {}",
            missing_headers.join(", ")
        )));
    }

    let mut email_to_index: HashMap<String, usize> = HashMap::new();
    let mut entries: Vec<GitUsernameEntry> = Vec::new();
    let mut missing_rows: Vec<usize> = Vec::new();

    for (row_index, record) in records.enumerate() {
        let record =
            record.map_err(|e| PlatformError::Other(format!("Failed to read CSV row: {}", e)))?;

        if record.iter().all(|cell| cell.trim().is_empty()) {
            continue;
        }

        let mut email = String::new();
        let mut git_username = String::new();

        for (idx, header) in headers.iter().enumerate() {
            let value = record.get(idx).unwrap_or("").trim();
            if value.is_empty() {
                continue;
            }
            match header.normalized.as_str() {
                "email" => email = value.to_string(),
                "git_username" => git_username = value.to_string(),
                _ => {}
            }
        }

        let row_number = row_index + 2;
        if email.trim().is_empty() || git_username.trim().is_empty() {
            missing_rows.push(row_number);
            continue;
        }

        let normalized_email = normalize_email(&email);
        let normalized_username = normalize_git_username(&git_username);
        let entry = GitUsernameEntry {
            email: normalized_email.clone(),
            git_username: normalized_username,
        };

        if let Some(existing) = email_to_index.get(&normalized_email).copied() {
            entries[existing] = entry;
        } else {
            email_to_index.insert(normalized_email, entries.len());
            entries.push(entry);
        }
    }

    if !missing_rows.is_empty() {
        return Err(PlatformError::Other(format!(
            "Missing required fields in rows: {}",
            missing_rows
                .iter()
                .map(|row| row.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        )));
    }

    Ok(entries)
}
