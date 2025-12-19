//! Pagination handling for Canvas API
//!
//! Canvas uses Link headers for pagination following RFC 5988.
//! This module provides utilities to parse and handle pagination.

use reqwest::header::HeaderMap;
use std::collections::HashMap;

/// Extract pagination links from response headers
///
/// Canvas returns Link headers like:
/// ```text
/// Link: <https://canvas.edu/api/v1/courses?page=2&per_page=10>; rel="next",
///       <https://canvas.edu/api/v1/courses?page=1&per_page=10>; rel="prev",
///       <https://canvas.edu/api/v1/courses?page=1&per_page=10>; rel="first",
///       <https://canvas.edu/api/v1/courses?page=5&per_page=10>; rel="last"
/// ```
pub fn parse_link_header(headers: &HeaderMap) -> HashMap<String, String> {
    let mut links = HashMap::new();

    if let Some(link_header) = headers.get("link") {
        if let Ok(link_str) = link_header.to_str() {
            for link in link_str.split(',') {
                let parts: Vec<&str> = link.split(';').collect();
                if parts.len() == 2 {
                    let url = parts[0]
                        .trim()
                        .trim_start_matches('<')
                        .trim_end_matches('>');
                    let rel = parts[1]
                        .trim()
                        .trim_start_matches("rel=\"")
                        .trim_end_matches('"');
                    links.insert(rel.to_string(), url.to_string());
                }
            }
        }
    }

    links
}

/// Get the next page URL from Link headers
pub fn get_next_page_url(headers: &HeaderMap) -> Option<String> {
    let links = parse_link_header(headers);
    links.get("next").cloned()
}

/// Get the previous page URL from Link headers
pub fn get_prev_page_url(headers: &HeaderMap) -> Option<String> {
    let links = parse_link_header(headers);
    links.get("prev").cloned()
}

/// Get the last page URL from Link headers
pub fn get_last_page_url(headers: &HeaderMap) -> Option<String> {
    let links = parse_link_header(headers);
    links.get("last").cloned()
}

/// Extract page number from a URL
pub fn extract_page_number(url: &str) -> Option<u32> {
    url::Url::parse(url)
        .ok()?
        .query_pairs()
        .find(|(key, _)| key == "page")
        .and_then(|(_, value)| value.parse::<u32>().ok())
}

/// Builder for paginated requests
#[derive(Debug, Clone)]
pub struct PaginationParams {
    /// Items per page (default: 100, max: 100 for Canvas)
    pub per_page: u32,
    /// Page number (1-indexed)
    pub page: Option<u32>,
}

impl Default for PaginationParams {
    fn default() -> Self {
        Self {
            per_page: 100,
            page: None,
        }
    }
}

impl PaginationParams {
    /// Create new pagination parameters with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the number of items per page
    pub fn per_page(mut self, per_page: u32) -> Self {
        self.per_page = per_page.min(100); // Canvas max is 100
        self
    }

    /// Set the page number
    pub fn page(mut self, page: u32) -> Self {
        self.page = Some(page);
        self
    }

    /// Convert to query parameters
    pub fn to_query_params(&self) -> Vec<(String, String)> {
        let mut params = vec![("per_page".to_string(), self.per_page.to_string())];
        if let Some(page) = self.page {
            params.push(("page".to_string(), page.to_string()));
        }
        params
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderMap, HeaderValue};

    #[test]
    fn test_parse_link_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "link",
            HeaderValue::from_str(
                r#"<https://canvas.edu/api/v1/courses?page=2&per_page=10>; rel="next", <https://canvas.edu/api/v1/courses?page=1&per_page=10>; rel="prev""#
            ).unwrap()
        );

        let links = parse_link_header(&headers);
        assert_eq!(
            links.get("next"),
            Some(&"https://canvas.edu/api/v1/courses?page=2&per_page=10".to_string())
        );
        assert_eq!(
            links.get("prev"),
            Some(&"https://canvas.edu/api/v1/courses?page=1&per_page=10".to_string())
        );
    }

    #[test]
    fn test_extract_page_number() {
        assert_eq!(
            extract_page_number("https://canvas.edu/api/v1/courses?page=5&per_page=10"),
            Some(5)
        );
        assert_eq!(
            extract_page_number("https://canvas.edu/api/v1/courses?per_page=10"),
            None
        );
    }

    #[test]
    fn test_pagination_params() {
        let params = PaginationParams::new().per_page(50).page(3);
        assert_eq!(params.per_page, 50);
        assert_eq!(params.page, Some(3));

        let query_params = params.to_query_params();
        assert!(query_params.contains(&("per_page".to_string(), "50".to_string())));
        assert!(query_params.contains(&("page".to_string(), "3".to_string())));
    }

    #[test]
    fn test_pagination_max_per_page() {
        let params = PaginationParams::new().per_page(200);
        assert_eq!(params.per_page, 100); // Should be capped at 100
    }
}
