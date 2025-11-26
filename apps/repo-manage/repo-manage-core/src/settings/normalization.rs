use super::error::{ConfigError, ConfigResult};
use std::path::{Path, PathBuf};

/// Trait for types that can be normalized
pub trait Normalize {
    /// Normalize the data in place
    fn normalize(&mut self);

    /// Create a normalized copy
    fn normalized(mut self) -> Self
    where
        Self: Sized,
    {
        self.normalize();
        self
    }
}

/// Normalize a string by trimming whitespace
pub fn normalize_string(s: &mut String) {
    *s = s.trim().to_string();
}

/// Normalize a vector of strings by trimming whitespace and removing empty entries
pub fn normalize_string_vec(vec: &mut Vec<String>) {
    *vec = vec
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
}

/// Parse a comma-separated string into a vector of trimmed strings
pub fn parse_comma_separated(s: &str) -> Vec<String> {
    s.split(',')
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

/// Join a vector of strings into a comma-separated string
pub fn join_comma_separated(vec: &[String]) -> String {
    vec.join(", ")
}

/// Normalize a path to an absolute path
pub fn normalize_path(path: &Path) -> ConfigResult<PathBuf> {
    if path.as_os_str().is_empty() {
        return Ok(PathBuf::new());
    }

    let normalized = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|_| ConfigError::PathNormalizationError {
                path: path.to_path_buf(),
            })?
            .join(path)
    };

    // Canonicalize if the path exists, otherwise just return the absolute path
    match normalized.canonicalize() {
        Ok(canonical) => Ok(canonical),
        Err(_) => {
            // Path doesn't exist yet, but that's okay for some use cases
            // Just return the absolute path
            Ok(normalized)
        }
    }
}

/// Normalize a vector of paths to absolute paths
pub fn normalize_paths(paths: &[PathBuf]) -> ConfigResult<Vec<PathBuf>> {
    paths.iter().map(|p| normalize_path(p)).collect()
}

/// Convert a path to POSIX format (forward slashes) for storage
pub fn path_to_posix_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// Normalize a URL string
pub fn normalize_url(url: &mut String) {
    *url = url.trim().trim_end_matches('/').to_string();
}

/// Clean and normalize boolean from various string representations
pub fn parse_bool_flexible(s: &str) -> Result<bool, String> {
    match s.trim().to_lowercase().as_str() {
        "true" | "yes" | "y" | "1" | "on" => Ok(true),
        "false" | "no" | "n" | "0" | "off" => Ok(false),
        _ => Err(format!("Cannot parse '{}' as boolean", s)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===== String Normalization Tests =====

    #[test]
    fn test_normalize_string_basic() {
        let mut s = "  hello world  ".to_string();
        normalize_string(&mut s);
        assert_eq!(s, "hello world");
    }

    #[test]
    fn test_normalize_string_no_whitespace() {
        let mut s = "hello".to_string();
        normalize_string(&mut s);
        assert_eq!(s, "hello");
    }

    #[test]
    fn test_normalize_string_only_whitespace() {
        let mut s = "   ".to_string();
        normalize_string(&mut s);
        assert_eq!(s, "");
    }

    #[test]
    fn test_normalize_string_empty() {
        let mut s = String::new();
        normalize_string(&mut s);
        assert_eq!(s, "");
    }

    #[test]
    fn test_normalize_string_tabs_and_newlines() {
        let mut s = "\t\nhello\n\t".to_string();
        normalize_string(&mut s);
        assert_eq!(s, "hello");
    }

    // ===== String Vector Normalization Tests =====

    #[test]
    fn test_normalize_string_vec_mixed() {
        let mut vec = vec![
            "  item1  ".to_string(),
            "".to_string(),
            "item2".to_string(),
            "  ".to_string(),
            "  item3  ".to_string(),
        ];
        normalize_string_vec(&mut vec);
        assert_eq!(vec, vec!["item1", "item2", "item3"]);
    }

    #[test]
    fn test_normalize_string_vec_empty() {
        let mut vec: Vec<String> = vec![];
        normalize_string_vec(&mut vec);
        assert_eq!(vec, Vec::<String>::new());
    }

    #[test]
    fn test_normalize_string_vec_all_empty() {
        let mut vec = vec!["".to_string(), "  ".to_string(), "\t".to_string()];
        normalize_string_vec(&mut vec);
        assert_eq!(vec, Vec::<String>::new());
    }

    #[test]
    fn test_normalize_string_vec_no_changes() {
        let mut vec = vec!["item1".to_string(), "item2".to_string()];
        normalize_string_vec(&mut vec);
        assert_eq!(vec, vec!["item1", "item2"]);
    }

    // ===== Comma-Separated Parsing Tests =====

    #[test]
    fn test_parse_comma_separated_basic() {
        assert_eq!(
            parse_comma_separated("a, b,  c  ,d"),
            vec!["a", "b", "c", "d"]
        );
    }

    #[test]
    fn test_parse_comma_separated_single() {
        assert_eq!(parse_comma_separated("single"), vec!["single"]);
    }

    #[test]
    fn test_parse_comma_separated_empty() {
        assert_eq!(parse_comma_separated(""), Vec::<String>::new());
    }

    #[test]
    fn test_parse_comma_separated_only_commas() {
        assert_eq!(parse_comma_separated("  ,  ,  "), Vec::<String>::new());
    }

    #[test]
    fn test_parse_comma_separated_extra_spaces() {
        assert_eq!(
            parse_comma_separated("  a  ,  b  "),
            vec!["a", "b"]
        );
    }

    #[test]
    fn test_parse_comma_separated_special_chars() {
        assert_eq!(
            parse_comma_separated("*.rs, *.toml, *.md"),
            vec!["*.rs", "*.toml", "*.md"]
        );
    }

    // ===== Comma-Separated Joining Tests =====

    #[test]
    fn test_join_comma_separated_multiple() {
        assert_eq!(
            join_comma_separated(&["a".to_string(), "b".to_string(), "c".to_string()]),
            "a, b, c"
        );
    }

    #[test]
    fn test_join_comma_separated_single() {
        assert_eq!(join_comma_separated(&["single".to_string()]), "single");
    }

    #[test]
    fn test_join_comma_separated_empty() {
        assert_eq!(join_comma_separated(&[]), "");
    }

    // ===== URL Normalization Tests =====

    #[test]
    fn test_normalize_url_basic() {
        let mut url = "  https://example.com/  ".to_string();
        normalize_url(&mut url);
        assert_eq!(url, "https://example.com");
    }

    #[test]
    fn test_normalize_url_trailing_slashes() {
        let mut url = "https://example.com///".to_string();
        normalize_url(&mut url);
        assert_eq!(url, "https://example.com");
    }

    #[test]
    fn test_normalize_url_with_path() {
        let mut url = "https://example.com/path/".to_string();
        normalize_url(&mut url);
        assert_eq!(url, "https://example.com/path");
    }

    #[test]
    fn test_normalize_url_no_trailing_slash() {
        let mut url = "https://example.com".to_string();
        normalize_url(&mut url);
        assert_eq!(url, "https://example.com");
    }

    #[test]
    fn test_normalize_url_with_port() {
        let mut url = "https://example.com:443/".to_string();
        normalize_url(&mut url);
        assert_eq!(url, "https://example.com:443");
    }

    // ===== Path to POSIX String Tests =====

    #[test]
    fn test_path_to_posix_string_unix() {
        let path = PathBuf::from("some/path/to/file.txt");
        assert_eq!(path_to_posix_string(&path), "some/path/to/file.txt");
    }

    #[test]
    fn test_path_to_posix_string_single() {
        let path = PathBuf::from("file.txt");
        assert_eq!(path_to_posix_string(&path), "file.txt");
    }

    #[cfg(windows)]
    #[test]
    fn test_path_to_posix_string_windows() {
        let path = PathBuf::from("some\\path\\to\\file.txt");
        assert_eq!(path_to_posix_string(&path), "some/path/to/file.txt");
    }

    // ===== Boolean Parsing Tests =====

    #[test]
    fn test_parse_bool_flexible_true_variants() {
        assert_eq!(parse_bool_flexible("true"), Ok(true));
        assert_eq!(parse_bool_flexible("TRUE"), Ok(true));
        assert_eq!(parse_bool_flexible("True"), Ok(true));
        assert_eq!(parse_bool_flexible("yes"), Ok(true));
        assert_eq!(parse_bool_flexible("YES"), Ok(true));
        assert_eq!(parse_bool_flexible("Y"), Ok(true));
        assert_eq!(parse_bool_flexible("y"), Ok(true));
        assert_eq!(parse_bool_flexible("1"), Ok(true));
        assert_eq!(parse_bool_flexible("on"), Ok(true));
        assert_eq!(parse_bool_flexible("ON"), Ok(true));
    }

    #[test]
    fn test_parse_bool_flexible_false_variants() {
        assert_eq!(parse_bool_flexible("false"), Ok(false));
        assert_eq!(parse_bool_flexible("FALSE"), Ok(false));
        assert_eq!(parse_bool_flexible("False"), Ok(false));
        assert_eq!(parse_bool_flexible("no"), Ok(false));
        assert_eq!(parse_bool_flexible("NO"), Ok(false));
        assert_eq!(parse_bool_flexible("N"), Ok(false));
        assert_eq!(parse_bool_flexible("n"), Ok(false));
        assert_eq!(parse_bool_flexible("0"), Ok(false));
        assert_eq!(parse_bool_flexible("off"), Ok(false));
        assert_eq!(parse_bool_flexible("OFF"), Ok(false));
    }

    #[test]
    fn test_parse_bool_flexible_invalid() {
        assert!(parse_bool_flexible("invalid").is_err());
        assert!(parse_bool_flexible("maybe").is_err());
        assert!(parse_bool_flexible("2").is_err());
        assert!(parse_bool_flexible("").is_err());
    }

    #[test]
    fn test_parse_bool_flexible_with_whitespace() {
        assert_eq!(parse_bool_flexible("  true  "), Ok(true));
        assert_eq!(parse_bool_flexible("  false  "), Ok(false));
    }

    // ===== Path Normalization Tests =====

    #[test]
    fn test_normalize_path_absolute() {
        let path = PathBuf::from("/tmp");
        let normalized = normalize_path(&path).unwrap();
        assert!(normalized.is_absolute());
    }

    #[test]
    fn test_normalize_path_empty() {
        let path = PathBuf::from("");
        let normalized = normalize_path(&path).unwrap();
        assert_eq!(normalized, PathBuf::new());
    }

    #[test]
    fn test_normalize_path_relative() {
        let path = PathBuf::from("relative/path");
        let normalized = normalize_path(&path).unwrap();
        assert!(normalized.is_absolute());
    }

    #[test]
    fn test_normalize_path_current_dir() {
        let path = PathBuf::from(".");
        let normalized = normalize_path(&path).unwrap();
        assert!(normalized.is_absolute());
        assert_eq!(normalized, std::env::current_dir().unwrap());
    }

    #[test]
    fn test_normalize_path_parent_dir() {
        let path = PathBuf::from("..");
        let normalized = normalize_path(&path).unwrap();
        assert!(normalized.is_absolute());
    }

    #[test]
    fn test_normalize_paths_multiple() {
        let paths = vec![
            PathBuf::from("/absolute/path"),
            PathBuf::from("relative/path"),
            PathBuf::from("."),
        ];
        let normalized = normalize_paths(&paths).unwrap();
        assert_eq!(normalized.len(), 3);
        assert!(normalized.iter().all(|p| p.is_absolute()));
    }

    #[test]
    fn test_normalize_paths_empty() {
        let paths: Vec<PathBuf> = vec![];
        let normalized = normalize_paths(&paths).unwrap();
        assert_eq!(normalized.len(), 0);
    }

    // ===== Normalize Trait Tests =====

    #[test]
    fn test_normalize_trait_normalized_method() {
        struct TestStruct {
            value: String,
        }

        impl Normalize for TestStruct {
            fn normalize(&mut self) {
                normalize_string(&mut self.value);
            }
        }

        let test = TestStruct {
            value: "  test  ".to_string(),
        };
        let normalized = test.normalized();
        assert_eq!(normalized.value, "test");
    }
}
