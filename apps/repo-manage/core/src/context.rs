use crate::generated::types::LmsContextKey;
use lms_common::LmsType;
use url::Url;

pub fn normalize_context(lms_type: LmsType, base_url: &str, course_id: &str) -> LmsContextKey {
    LmsContextKey {
        lms_type,
        base_url: normalize_base_url(base_url),
        course_id: course_id.trim().to_string(),
    }
}

fn normalize_base_url(base_url: &str) -> String {
    let trimmed = base_url.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{}", trimmed)
    };

    let mut url = match Url::parse(&candidate) {
        Ok(url) => url,
        Err(_) => return trimmed.trim_end_matches('/').to_string(),
    };

    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);

    if let Some(host) = url.host_str() {
        let host_lower = host.to_lowercase();
        let _ = url.set_host(Some(&host_lower));
    }

    let scheme_lower = url.scheme().to_lowercase();
    if scheme_lower != url.scheme() {
        let _ = url.set_scheme(&scheme_lower);
    }

    if let Some(port) = url.port() {
        let scheme = url.scheme();
        if (scheme == "https" && port == 443) || (scheme == "http" && port == 80) {
            let _ = url.set_port(None);
        }
    }

    url.to_string().trim_end_matches('/').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_context_trims_fields() {
        let key = normalize_context(LmsType::Canvas, "  https://Example.com/  ", "  course-1 ");
        assert_eq!(key.base_url, "https://example.com");
        assert_eq!(key.course_id, "course-1");
    }

    #[test]
    fn normalize_context_adds_scheme_and_strips_default_port() {
        let key = normalize_context(LmsType::Moodle, "Example.com:443/canvas/", "101");
        assert_eq!(key.base_url, "https://example.com/canvas");
    }

    #[test]
    fn normalize_context_preserves_path_without_query_or_fragment() {
        let key = normalize_context(
            LmsType::Canvas,
            "https://example.com/canvas/?a=1#frag",
            "101",
        );
        assert_eq!(key.base_url, "https://example.com/canvas");
    }

    #[test]
    fn normalize_context_removes_userinfo() {
        let key = normalize_context(
            LmsType::Canvas,
            "https://user:pass@example.com/canvas",
            "101",
        );
        assert_eq!(key.base_url, "https://example.com/canvas");
    }
}
