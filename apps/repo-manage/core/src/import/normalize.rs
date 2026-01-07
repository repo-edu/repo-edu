pub fn normalize_email(value: &str) -> String {
    value.trim().to_lowercase()
}

pub fn normalize_git_username(value: &str) -> String {
    value.trim().to_lowercase()
}

pub fn normalize_header(value: &str) -> String {
    let mut normalized = String::with_capacity(value.len());
    let mut last_was_sep = false;
    for ch in value.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            normalized.push(ch);
            last_was_sep = false;
        } else if !last_was_sep {
            normalized.push('_');
            last_was_sep = true;
        }
    }
    normalized.trim_matches('_').to_string()
}

pub fn normalize_group_name(value: &str) -> String {
    normalize_collapsed_whitespace(value)
}

pub fn normalize_assignment_name(value: &str) -> String {
    normalize_collapsed_whitespace(value)
}

fn normalize_collapsed_whitespace(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}
